/**
 * お客様が担当を指名しない予約（「誰でもいい」・担当を選ばせない部署）。
 *
 * 画面から担当を受け取らず、予約の瞬間にここで決める。
 * その時間に空いている人を、その日の予約が少ない順（同じならくじ）に並べ（staff-assignment.ts）、
 * 先頭から bookAsCustomer で入れてみる。bookAsCustomer は書き込みと同じ取引の中で空きを確かめ直すので、
 * 同時に別の予約が入って埋まっていれば失敗し、次の人を試す（二重予約にはならない）。
 */
import { findAvailability } from "./availability";
import { type Result, bookAsCustomer } from "./booking";
import { checkBookingWindow } from "./booking-window";
import { prisma } from "./prisma";
import { orderByLoad } from "./staff-assignment";

const SLOT_GONE = "その時間はご予約いただけなくなりました。お手数ですが選び直してください";

export async function bookAsCustomerAnyStaff(input: {
  tenantId: string;
  customerId: string;
  date: string;
  menuId: string;
  startMinutes: number;
  now?: Date;
  /** くじ引きに使う（テストで決まった値を渡す） */
  random?: () => number;
}): Promise<Result<{ reservationId: string; staffId: string }>> {
  const { random, ...booking } = input;
  const { tenantId, date, menuId, startMinutes } = booking;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "店舗が見つかりません" };

  // 受付期間・締め切りは担当を変えても同じなので、先に1回だけ確かめる
  const window = checkBookingWindow({
    date,
    startMinutes,
    windowDays: tenant.bookingWindowDays,
    leadMinutes: tenant.bookingLeadMinutes,
    now: booking.now,
  });
  if (!window.ok) return { ok: false, message: window.message };

  let availability;
  try {
    availability = await findAvailability({ tenantId, date, menuId });
  } catch {
    return { ok: false, message: "メニューが見つかりません" };
  }
  const candidates = availability.perStaff
    .filter((s) => s.starts.includes(startMinutes))
    .map((s) => s.staffId);
  if (candidates.length === 0) return { ok: false, message: SLOT_GONE };

  const counts = await prisma.reservation.groupBy({
    by: ["staffId"],
    where: { tenantId, date, status: "booked", staffId: { in: candidates } },
    _count: { _all: true },
  });
  const dayCounts = new Map(counts.map((c) => [c.staffId, c._count._all]));

  for (const staffId of orderByLoad(candidates, dayCounts, random)) {
    const result = await bookAsCustomer({ ...booking, staffId });
    if (result.ok) return { ok: true, reservationId: result.reservationId, staffId };
  }
  // 空いていた人が、確かめている間に全員埋まった
  return { ok: false, message: SLOT_GONE };
}
