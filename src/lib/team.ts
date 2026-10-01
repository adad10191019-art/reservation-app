/**
 * 「全社の1日」のデータを集める（DBから読む部分）。
 * 見せ方の判断（私用を隠す・お客様名を出さない）は team-view.ts にある。
 *
 * 部署をまたいで読むので、予約はお客様・メニューを読まず、時刻の列だけを選ぶ。
 */
import { prisma } from "./prisma";
import type { SessionData } from "./session";
import { type TeamColumn, type TeamViewer, buildTeamColumns } from "./team-view";

/** ログインしている人が、名簿のどの社員か */
export async function getTeamViewer(session: SessionData): Promise<TeamViewer> {
  const isAdmin = session.role === "group_admin";
  if (!session.staffId) return { employeeId: null, isAdmin };

  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { employeeId: true },
  });
  return { employeeId: staff?.employeeId ?? null, isAdmin };
}

export async function getTeamDay(date: string, viewer: TeamViewer): Promise<TeamColumn[]> {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const employeeIds = employees.map((e) => e.id);

  const staffs = await prisma.staff.findMany({
    where: { employeeId: { in: employeeIds }, isActive: true },
    select: { id: true, employeeId: true, tenant: { select: { name: true } } },
  });
  const staffIds = staffs.map((s) => s.id);

  const [events, reservations, blocks] = await Promise.all([
    prisma.employeeEvent.findMany({
      where: { employeeId: { in: employeeIds }, date },
      select: {
        id: true,
        employeeId: true,
        startMinutes: true,
        endMinutes: true,
        title: true,
        isPrivate: true,
      },
    }),
    prisma.reservation.findMany({
      where: { staffId: { in: staffIds }, date, status: "booked" },
      // お客様・メニューは読まない（全社員が見る画面のため）
      select: { id: true, staffId: true, startMinutes: true, endMinutes: true },
    }),
    // 店舗全体のブロック枠（staffId が null）は「その人の予定」ではないので出さない
    prisma.block.findMany({
      where: { staffId: { in: staffIds }, date },
      select: { id: true, staffId: true, startMinutes: true, endMinutes: true, reason: true },
    }),
  ]);

  return buildTeamColumns(
    {
      employees,
      staffs: staffs.map((s) => ({ id: s.id, employeeId: s.employeeId!, tenantName: s.tenant.name })),
      events,
      reservations,
      blocks: blocks.map((b) => ({ ...b, staffId: b.staffId! })),
    },
    viewer,
  );
}
