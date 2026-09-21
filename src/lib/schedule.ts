/**
 * 1日分の予定表を組み立てる。カレンダー画面が使う。
 */
import { prisma } from "./prisma";
import { resolveWorkingIntervals } from "./availability-core";
import { type Interval, dayOfWeekOf } from "./time";

export type ScheduledReservation = {
  id: string;
  staffId: string;
  startMinutes: number;
  endMinutes: number;
  menuName: string;
  customerName: string;
  durationMinutes: number;
  price: number;
};

export type StaffColumn = {
  staffId: string;
  staffName: string;
  working: Interval[];
  reservations: ScheduledReservation[];
};

export type DaySchedule = {
  date: string;
  columns: StaffColumn[];
  /** 表示する時間の範囲。全員休みの日は既定値を使う */
  viewStart: number;
  viewEnd: number;
};

const DEFAULT_VIEW_START = 9 * 60;
const DEFAULT_VIEW_END = 20 * 60;

/** ログインしている人の所属店舗を取り出す */
export async function getTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("店舗が見つかりません");
  return tenant;
}

export async function getDaySchedule(params: {
  tenantId: string;
  date: string;
}): Promise<DaySchedule> {
  const { tenantId, date } = params;
  const dayOfWeek = dayOfWeekOf(date);

  const staffs = await prisma.staff.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  const staffIds = staffs.map((s) => s.id);

  const [businessHours, dateOverrides, reservations] = await Promise.all([
    prisma.businessHour.findMany({
      where: { tenantId, dayOfWeek, OR: [{ staffId: null }, { staffId: { in: staffIds } }] },
    }),
    prisma.dateOverride.findMany({
      where: { tenantId, date, OR: [{ staffId: null }, { staffId: { in: staffIds } }] },
    }),
    prisma.reservation.findMany({
      where: { tenantId, date, staffId: { in: staffIds }, status: "booked" },
      include: { customer: true },
      orderBy: { startMinutes: "asc" },
    }),
  ]);

  const columns: StaffColumn[] = staffs.map((staff) => ({
    staffId: staff.id,
    staffName: staff.name,
    working: resolveWorkingIntervals({ staffId: staff.id, businessHours, dateOverrides }),
    reservations: reservations
      .filter((r) => r.staffId === staff.id)
      .map((r) => ({
        id: r.id,
        staffId: r.staffId,
        startMinutes: r.startMinutes,
        endMinutes: r.endMinutes,
        menuName: r.menuNameSnapshot,
        customerName: r.customer.name,
        durationMinutes: r.durationSnapshot,
        price: r.priceSnapshot,
      })),
  }));

  // 勤務時間と予約が全部収まるように表示範囲を決める
  const points = columns.flatMap((c) => [
    ...c.working.flatMap((w) => [w.start, w.end]),
    ...c.reservations.flatMap((r) => [r.startMinutes, r.endMinutes]),
  ]);

  const viewStart =
    points.length > 0 ? Math.floor(Math.min(...points) / 60) * 60 : DEFAULT_VIEW_START;
  const viewEnd =
    points.length > 0 ? Math.ceil(Math.max(...points) / 60) * 60 : DEFAULT_VIEW_END;

  return { date, columns, viewStart, viewEnd };
}
