/**
 * お客様の登録・照合。
 *
 * "use server" のファイルから公開すると、外部から直接呼べる入口になってしまうため、
 * 通常のモジュールとして分けておく。
 */
import { cookies } from "next/headers";
import { EMAIL_LOGIN_COOKIE } from "./constants";
import { getCustomerSession } from "./customer-session";
import { prisma } from "./prisma";

/**
 * LINEの利用者IDでお客様を探し、いなければ作る。
 *
 * LINE の表示名は lineDisplayName に取っておき、ログインのたびに追従する。
 * name は、お客様が確認画面で自分の名前を入力するまでは表示名を仮に入れておき、
 * 入力した後（nameEnteredAt あり）は上書きしない。
 */
export async function upsertLineCustomer(params: {
  tenantId: string;
  lineUserId: string;
  displayName: string;
}) {
  const { tenantId, lineUserId, displayName } = params;

  const existing = await prisma.customer.findFirst({ where: { tenantId, lineUserId } });
  if (existing) {
    const data: { lineDisplayName?: string; name?: string } = {};
    if (existing.lineDisplayName !== displayName) data.lineDisplayName = displayName;
    if (!existing.nameEnteredAt && existing.name !== displayName) data.name = displayName;
    if (Object.keys(data).length === 0) return existing;

    await prisma.customer.updateMany({ where: { id: existing.id, tenantId }, data });
    return { ...existing, ...data };
  }

  return prisma.customer.create({
    data: { tenantId, name: displayName, lineDisplayName: displayName, lineUserId },
  });
}

/** メールアドレスでお客様を探し、いなければ作る（メールログイン用） */
export async function upsertEmailCustomer(params: {
  tenantId: string;
  email: string;
  name: string;
}) {
  const { tenantId, email, name } = params;

  // メールログインでは、お客様が自分で名前を入力している
  const now = new Date();
  const existing = await prisma.customer.findFirst({ where: { tenantId, email } });
  if (existing) {
    // 名前が変わっていれば、新しく入力された方に合わせる
    if (existing.name !== name || !existing.nameEnteredAt) {
      await prisma.customer.updateMany({
        where: { id: existing.id, tenantId },
        data: { name, nameEnteredAt: now },
      });
      return { ...existing, name, nameEnteredAt: now };
    }
    return existing;
  }

  return prisma.customer.create({
    data: { tenantId, name, email, nameEnteredAt: now },
  });
}

/**
 * ログイン中のお客様を取り出す。
 *
 * Cookie の中身をそのまま信じず、その店舗に実在するか毎回確かめる。
 * 削除された場合や、別の店舗のログインが残っている場合に弾ける。
 */
export async function getActiveCustomer(tenantId: string) {
  const session = await getCustomerSession();
  if (!session || session.tenantId !== tenantId) return null;

  const customer = await prisma.customer.findFirst({
    where: { id: session.customerId, tenantId },
  });
  // 画面の描画中は Cookie を書き換えられないので、消さずに未ログイン扱いにする
  if (!customer) return null;

  return {
    customerId: customer.id,
    tenantId,
    name: customer.name,
    phone: customer.phone,
    /** 確認画面で自分の名前を入力したことがあるか（無ければ入力欄を空で出す） */
    nameEntered: customer.nameEnteredAt !== null,
  };
}

/**
 * 予約の確認画面で入力された名前・電話番号を保存する。
 * 電話番号を空にして送られたら、登録済みの番号も消す（任意の項目のため）。
 */
export async function saveCustomerProfile(params: {
  tenantId: string;
  customerId: string;
  name: string;
  phone: string | null;
  now?: Date;
}) {
  const { tenantId, customerId, name, phone, now = new Date() } = params;
  const result = await prisma.customer.updateMany({
    where: { id: customerId, tenantId },
    data: { name, phone, nameEnteredAt: now },
  });
  return result.count === 1;
}

export type EmailLoginPending = { tenantId: string; email: string; name: string };

/** メールログインの「コード入力待ち」状態を、一時Cookieから読む */
export async function getEmailLoginPending(tenantId: string): Promise<EmailLoginPending | null> {
  const store = await cookies();
  const raw = store.get(EMAIL_LOGIN_COOKIE)?.value;
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as Partial<EmailLoginPending>;
    if (!data.tenantId || data.tenantId !== tenantId || !data.email || !data.name) return null;
    return { tenantId: data.tenantId, email: data.email, name: data.name };
  } catch {
    return null;
  }
}
