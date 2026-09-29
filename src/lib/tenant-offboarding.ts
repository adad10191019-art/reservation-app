/**
 * 部署（テナント）の解約まわり。
 *
 * 解約 = そのテナントに属する全データの削除。予約データも含めて完全に消える
 * ため、削除前に必ずエクスポート（buildTenantExport）を案内する。
 *
 * 外部キーに ON DELETE CASCADE を張っていないテーブルが大半なので
 * （予約など、うっかり連鎖削除されると困るデータが多いため）、
 * ここで子テーブルから順に明示的に消してから Tenant 本体を消す。
 */
import { prisma } from "./prisma";
import { revokeGoogleToken } from "./google-calendar";

export type TenantExport = {
  exportedAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string | null;
    timezone: string;
    slotMinutes: number;
    bookingWindowDays: number;
    bookingLeadMinutes: number;
    createdAt: string;
  };
  staffs: unknown[];
  menus: unknown[];
  businessHours: unknown[];
  dateOverrides: unknown[];
  blocks: unknown[];
  customers: unknown[];
  reservations: unknown[];
  changeLogs: unknown[];
  accounts: unknown[];
};

/**
 * クライアント企業が自社の顧客管理・経理に使えるよう、テナントの全データを
 * 書き出す。パスワードハッシュやLINE/Googleの認証情報など、内部的な秘密は
 * 含めない（渡す相手が必要とするのは業務データであり、これらは漏れると
 * セキュリティ事故になるだけで先方には無用なため）。
 */
export async function buildTenantExport(tenantId: string): Promise<TenantExport | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return null;

  const [staffs, menus, businessHours, dateOverrides, blocks, customers, reservations, changeLogs, accounts] =
    await Promise.all([
      prisma.staff.findMany({ where: { tenantId }, orderBy: { displayOrder: "asc" } }),
      prisma.menu.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      prisma.businessHour.findMany({ where: { tenantId } }),
      prisma.dateOverride.findMany({ where: { tenantId } }),
      prisma.block.findMany({ where: { tenantId }, orderBy: { date: "asc" } }),
      prisma.customer.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      prisma.reservation.findMany({ where: { tenantId }, orderBy: { date: "asc" } }),
      prisma.changeLog.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      prisma.user.findMany({
        where: { tenantId },
        select: { id: true, email: true, role: true, staffId: true, createdAt: true },
      }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
      slotMinutes: tenant.slotMinutes,
      bookingWindowDays: tenant.bookingWindowDays,
      bookingLeadMinutes: tenant.bookingLeadMinutes,
      createdAt: tenant.createdAt.toISOString(),
    },
    staffs,
    menus,
    businessHours,
    dateOverrides,
    blocks,
    customers,
    reservations,
    changeLogs,
    accounts,
  };
}

/**
 * テナントを完全に削除する（解約処理）。取り消せない。
 *
 * 1. Googleカレンダー連携のリフレッシュトークンを、消す前に読み出してGoogleに
 *    失効を伝える（ベストエフォート。失敗してもDBの削除は進める）。
 * 2. 子テーブルを外部キーの向きに沿って先に消し、最後にTenant本体を消す。
 *    1つの取引にまとめ、途中で失敗しても中途半端な状態を残さない。
 */
export async function deleteTenantCompletely(tenantId: string): Promise<void> {
  const connections = await prisma.googleCalendarConnection.findMany({
    where: { tenantId },
    select: { refreshToken: true },
  });
  await Promise.all(connections.map((c) => revokeGoogleToken(c.refreshToken)));

  await prisma.$transaction([
    prisma.reservation.deleteMany({ where: { tenantId } }),
    prisma.googleCalendarConnection.deleteMany({ where: { tenantId } }),
    prisma.staffMenu.deleteMany({ where: { tenantId } }),
    prisma.businessHour.deleteMany({ where: { tenantId } }),
    prisma.dateOverride.deleteMany({ where: { tenantId } }),
    prisma.block.deleteMany({ where: { tenantId } }),
    prisma.changeLog.deleteMany({ where: { tenantId } }),
    prisma.customer.deleteMany({ where: { tenantId } }),
    prisma.menu.deleteMany({ where: { tenantId } }),
    prisma.user.deleteMany({ where: { tenantId } }),
    prisma.staff.deleteMany({ where: { tenantId } }),
    prisma.tenant.delete({ where: { id: tenantId } }),
  ]);
}
