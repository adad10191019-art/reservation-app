/**
 * 店舗の取り出し。
 *
 * お客様向けURLは短い名前（slug）でも店舗IDでも開ける。
 * 短い名前を後から付けても、それまでに配ったリンクが壊れないようにするため。
 */
import { prisma } from "./prisma";

export type TenantHandle = { id: string; slug: string | null };

/** URLに載っている値から店舗を探す。短い名前を優先し、無ければIDで探す */
export async function findTenantByHandle(handle: string) {
  if (!handle) return null;

  const bySlug = await prisma.tenant.findFirst({ where: { slug: handle } });
  if (bySlug) return bySlug;

  return prisma.tenant.findUnique({ where: { id: handle } });
}

/** その店舗のお客様向けURLに載せる値 */
export function tenantHandle(tenant: TenantHandle): string {
  return tenant.slug ?? tenant.id;
}

/** 店舗IDから、お客様向けURLに載せる値を引く */
export async function handleOf(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true },
  });
  return tenant ? tenantHandle(tenant) : tenantId;
}
