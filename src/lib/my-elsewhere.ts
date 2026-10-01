/**
 * 「自分の予定」に並べる、今選んでいる部署の外にある自分の予定。
 *
 *   ・兼任先の部署での自分の予約（部署名・メニュー・お客様名つき）とブロック枠
 *   ・自分の予定（全社の1日で入れたもの。私用でも本人なので件名を出す）
 *
 * 「兼任先の自分」は、自分のアカウントの担当部署のスタッフと、名簿で同じ人を指すスタッフ。
 * どちらも本人の予定なので、person-busy.ts（他人の部署の空き計算用で、時刻しか返さない）と違い、
 * 中身まで読む。
 */
import { prisma } from "./prisma";

export type ElsewhereItem =
  | {
      kind: "elsewhere-reservation";
      id: string;
      startMinutes: number;
      endMinutes: number;
      tenantName: string;
      menuName: string;
      customerName: string;
    }
  | {
      kind: "elsewhere-block";
      id: string;
      startMinutes: number;
      endMinutes: number;
      tenantName: string;
      reason: string;
    }
  | { kind: "event"; id: string; startMinutes: number; endMinutes: number; title: string };

export async function fetchMyElsewhere(params: {
  userId: string;
  tenantId: string;
  staffId: string;
  date: string;
}): Promise<ElsewhereItem[]> {
  const { userId, tenantId, staffId, date } = params;

  const [user, currentStaff] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        employeeId: true,
        memberships: { where: { tenantId: { not: tenantId } }, select: { staffId: true } },
      },
    }),
    prisma.staff.findUnique({ where: { id: staffId }, select: { employeeId: true } }),
  ]);
  const employeeId = user?.employeeId ?? currentStaff?.employeeId ?? null;

  const siblings = employeeId
    ? await prisma.staff.findMany({
        where: { employeeId, tenantId: { not: tenantId } },
        select: { id: true },
      })
    : [];
  const staffIds = [
    ...new Set([
      ...(user?.memberships.flatMap((m) => (m.staffId ? [m.staffId] : [])) ?? []),
      ...siblings.map((s) => s.id),
    ]),
  ];

  const [reservations, blocks, events] = await Promise.all([
    staffIds.length > 0
      ? prisma.reservation.findMany({
          where: { staffId: { in: staffIds }, date, status: "booked" },
          select: {
            id: true,
            startMinutes: true,
            endMinutes: true,
            menuNameSnapshot: true,
            customer: { select: { name: true } },
            tenant: { select: { name: true } },
          },
        })
      : [],
    // 店舗全体のブロック枠（staffId が null）は、その人の予定ではないので出さない
    staffIds.length > 0
      ? prisma.block.findMany({
          where: { staffId: { in: staffIds }, date },
          select: {
            id: true,
            startMinutes: true,
            endMinutes: true,
            reason: true,
            tenant: { select: { name: true } },
          },
        })
      : [],
    employeeId
      ? prisma.employeeEvent.findMany({
          where: { employeeId, date },
          select: { id: true, startMinutes: true, endMinutes: true, title: true },
        })
      : [],
  ]);

  return [
    ...reservations.map(
      (r): ElsewhereItem => ({
        kind: "elsewhere-reservation",
        id: r.id,
        startMinutes: r.startMinutes,
        endMinutes: r.endMinutes,
        tenantName: r.tenant.name,
        menuName: r.menuNameSnapshot,
        customerName: r.customer.name,
      }),
    ),
    ...blocks.map(
      (b): ElsewhereItem => ({
        kind: "elsewhere-block",
        id: b.id,
        startMinutes: b.startMinutes,
        endMinutes: b.endMinutes,
        tenantName: b.tenant.name,
        reason: b.reason,
      }),
    ),
    ...events.map((e): ElsewhereItem => ({ kind: "event", ...e })),
  ];
}
