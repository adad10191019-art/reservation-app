/**
 * お客様の登録・照合。
 *
 * "use server" のファイルから公開すると、外部から直接呼べる入口になってしまうため、
 * 通常のモジュールとして分けておく。
 */
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
