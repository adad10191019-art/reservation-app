/**
 * 「全体スケジュール」のデータを集める（DBから読む部分）。
 * 見せ方の判断（私用を隠す・お客様名を出さない）は team-view.ts にある。
 *
 * 部署をまたいで読むので、予約はお客様・メニューを読まず、時刻の列だけを選ぶ。
 */
import { getGoogleEventsForTeam } from "./google-calendar-cache";
import { prisma } from "./prisma";
import type { AnySession } from "./session";
import { type TeamColumn, type TeamViewer, buildTeamColumns } from "./team-view";

/** ログインしている人が、名簿のどの社員か */
export async function getTeamViewer(session: AnySession): Promise<TeamViewer> {
  const isAdmin = session.role === "group_admin";
  // アカウントが名簿の人を直接指していればそれ（担当部署の無い社員は必ずこちら）
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { employeeId: true },
  });
  if (user?.employeeId) return { employeeId: user.employeeId, isAdmin };
  if (!session.staffId) return { employeeId: null, isAdmin };

  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { employeeId: true },
  });
  return { employeeId: staff?.employeeId ?? null, isAdmin };
}

/**
 * 何日分かの全体スケジュールを、日付 → 1人1列 の形で返す。
 * 週・月の表示は1人分だけを見るので、onlyEmployeeId でその人に絞る（全員並べるのは1日表示だけ）。
 */
export async function getTeamDays(
  dates: string[],
  viewer: TeamViewer,
  onlyEmployeeId?: string,
): Promise<Map<string, TeamColumn[]>> {
  const employees = await prisma.employee.findMany({
    where: { isActive: true, ...(onlyEmployeeId ? { id: onlyEmployeeId } : {}) },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const employeeIds = employees.map((e) => e.id);

  const staffs = await prisma.staff.findMany({
    where: { employeeId: { in: employeeIds }, isActive: true },
    select: { id: true, employeeId: true, tenant: { select: { name: true } } },
  });
  const staffIds = staffs.map((s) => s.id);
  const inDates = { in: dates };

  const [events, reservations, blocks, googleByEmployee] = await Promise.all([
    prisma.employeeEvent.findMany({
      where: { employeeId: { in: employeeIds }, date: inDates },
      select: {
        id: true,
        employeeId: true,
        date: true,
        startMinutes: true,
        endMinutes: true,
        title: true,
        isPrivate: true,
      },
    }),
    prisma.reservation.findMany({
      where: { staffId: { in: staffIds }, date: inDates, status: "booked" },
      // お客様・メニューは読まない（全社員が見る画面のため）
      select: { id: true, staffId: true, date: true, startMinutes: true, endMinutes: true },
    }),
    // 店舗全体のブロック枠（staffId が null）は「その人の予定」ではないので出さない
    prisma.block.findMany({
      where: { staffId: { in: staffIds }, date: inDates },
      select: { id: true, staffId: true, date: true, startMinutes: true, endMinutes: true, reason: true },
    }),
    // 連携している人の Google の予定（少しの間だけ覚えておいた分を使う）
    getGoogleEventsForTeam(employeeIds, dates),
  ]);

  const staffRows = staffs.map((s) => ({ id: s.id, employeeId: s.employeeId!, tenantName: s.tenant.name }));
  return new Map(
    dates.map((date) => [
      date,
      buildTeamColumns(
        {
          employees,
          staffs: staffRows,
          events: events.filter((e) => e.date === date),
          reservations: reservations.filter((r) => r.date === date),
          blocks: blocks.filter((b) => b.date === date).map((b) => ({ ...b, staffId: b.staffId! })),
          googleEvents: [...googleByEmployee].flatMap(([employeeId, byDate]) =>
            (byDate.get(date) ?? []).map((g) => ({
              employeeId,
              startMinutes: g.start,
              endMinutes: g.end,
              title: g.title,
              id: g.id,
              editable: g.editable,
            })),
          ),
        },
        viewer,
      ),
    ]),
  );
}
