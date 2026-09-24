import { NextResponse } from "next/server";
import { buildIcsCalendar, type IcsEvent } from "@/lib/ics";
import { prisma } from "@/lib/prisma";
import { addDays, todayString } from "@/lib/time";

// 見せる範囲。予約は先まで、自分の予定（ブロック枠）は少し過去まで見えると
// 「あれ、あの日の予定どこいった」にならずに済む
const PAST_DAYS = 14;
const FUTURE_DAYS = 90;

/**
 * Googleカレンダー等の「URLから追加」で購読するための .ics 配信。
 * ログインではなく、推測できない長さのトークンだけで認証する。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return new NextResponse("Not found", { status: 404 });

  const staff = await prisma.staff.findFirst({
    where: { calendarToken: token, isActive: true },
    include: { tenant: true },
  });
  if (!staff) return new NextResponse("Not found", { status: 404 });

  const from = addDays(todayString(), -PAST_DAYS);
  const to = addDays(todayString(), FUTURE_DAYS);

  const [reservations, blocks] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        tenantId: staff.tenantId,
        staffId: staff.id,
        status: "booked",
        date: { gte: from, lte: to },
      },
      include: { customer: true },
    }),
    prisma.block.findMany({
      where: {
        tenantId: staff.tenantId,
        date: { gte: from, lte: to },
        OR: [{ staffId: null }, { staffId: staff.id }],
      },
    }),
  ]);

  const events: IcsEvent[] = [
    ...reservations.map(
      (r): IcsEvent => ({
        uid: `reservation-${r.id}@reservation-app`,
        date: r.date,
        startMinutes: r.startMinutes,
        endMinutes: r.endMinutes,
        summary: `${r.menuNameSnapshot}（${r.customer.name} 様）`,
        description: `担当：${staff.name}\n所要：${r.durationSnapshot}分`,
        location: staff.tenant.name,
      }),
    ),
    ...blocks.map(
      (b): IcsEvent => ({
        uid: `block-${b.id}@reservation-app`,
        date: b.date,
        startMinutes: b.startMinutes,
        endMinutes: b.endMinutes,
        summary: b.staffId === null ? `${b.reason}（店舗全体）` : b.reason,
        location: staff.tenant.name,
      }),
    ),
  ];

  const body = buildIcsCalendar({
    calendarName: `${staff.tenant.name}（${staff.name}）`,
    events,
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=schedule.ics",
      // Google側のポーリング頻度はGoogle任せだが、こちらの意図として短めに示しておく
      "Cache-Control": "no-store",
    },
  });
}
