/**
 * イベントの一覧の読み込み（お客様向けの画面で使う）。
 */
import { isBeforeEventDeadline } from "./event-booking";
import { prisma } from "./prisma";
import { todayString } from "./time";

export type OpenEvent = {
  id: string;
  title: string;
  description: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  venue: string;
  capacity: number;
  remaining: number;
};

/** 受付中で、申し込みの締め切り前のイベントを日付の早い順に。残りの席数つき */
export async function listOpenEvents(tenantId: string, leadMinutes: number): Promise<OpenEvent[]> {
  const events = await prisma.event.findMany({
    where: { tenantId, isOpen: true, date: { gte: todayString() } },
    orderBy: [{ date: "asc" }, { startMinutes: "asc" }],
    include: { _count: { select: { entries: { where: { status: "booked" } } } } },
  });
  return events
    .filter((e) => isBeforeEventDeadline(e, leadMinutes))
    .map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.date,
      startMinutes: e.startMinutes,
      endMinutes: e.endMinutes,
      venue: e.venue,
      capacity: e.capacity,
      remaining: Math.max(0, e.capacity - e._count.entries),
    }));
}
