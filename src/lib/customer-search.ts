/**
 * 顧客の検索。顧客一覧と予約登録画面の顧客選択で、同じ条件を使う。
 *
 * 名前・メールは大文字小文字を区別せず、電話番号はそのままの部分一致。
 * tenantId は必ず条件に入れる（他の店舗の顧客を出さない）。
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

export function customerSearchWhere(tenantId: string, q: string): Prisma.CustomerWhereInput {
  const query = q.trim();
  return {
    tenantId,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export type CustomerCandidate = { id: string; name: string; phone: string | null };

/**
 * 予約登録画面の候補。件数を絞って返し、超えた分があるかも伝える。
 * 空の検索語では何も返さない（全件を画面に流さないため）。
 */
export async function searchCustomerCandidates(
  tenantId: string,
  q: string,
  limit = 20,
): Promise<{ customers: CustomerCandidate[]; more: boolean }> {
  if (!q.trim()) return { customers: [], more: false };

  const rows = await prisma.customer.findMany({
    where: customerSearchWhere(tenantId, q),
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    // 1件多く取って、上限を超えたかを見分ける
    take: limit + 1,
  });

  return { customers: rows.slice(0, limit), more: rows.length > limit };
}
