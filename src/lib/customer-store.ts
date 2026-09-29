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

/** LINEの利用者IDでお客様を探し、いなければ作る */
export async function upsertLineCustomer(params: {
  tenantId: string;
  lineUserId: string;
  displayName: string;
}) {
  const { tenantId, lineUserId, displayName } = params;

  const existing = await prisma.customer.findFirst({ where: { tenantId, lineUserId } });
  if (existing) {
    // 表示名が変わっていれば追従する
    if (existing.name !== displayName) {
      await prisma.customer.updateMany({
        where: { id: existing.id, tenantId },
        data: { name: displayName },
      });
      return { ...existing, name: displayName };
    }
    return existing;
  }

  return prisma.customer.create({
    data: { tenantId, name: displayName, lineUserId },
  });
}

/** メールアドレスでお客様を探し、いなければ作る（メールログイン用） */
export async function upsertEmailCustomer(params: {
  tenantId: string;
  email: string;
  name: string;
}) {
  const { tenantId, email, name } = params;

  const existing = await prisma.customer.findFirst({ where: { tenantId, email } });
  if (existing) {
    // 名前が変わっていれば追従する（LINEログインと同じ考え方）
    if (existing.name !== name) {
      await prisma.customer.updateMany({
        where: { id: existing.id, tenantId },
        data: { name },
      });
      return { ...existing, name };
    }
    return existing;
  }

  return prisma.customer.create({
    data: { tenantId, name, email },
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

  return { customerId: customer.id, tenantId, name: customer.name };
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
