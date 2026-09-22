/**
 * 予定表を組み立てる。カレンダー画面（日表示・週表示）が使う。
 */
import { prisma } from "./prisma";
import { resolveWorkingIntervals } from "./availability-core";
import { addDays, type Interval, dayOfWeekOf } from "./time";

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

export type ScheduledBlock = {
  id: string;
  startMinutes: number;
  endMinutes: number;
  reason: string;
  /** 店舗全体のブロックか */
  wholeShop: boolean;
};

export type StaffColumn = {
  staffId: string;
  staffName: string;
  working: Interval[];
  reservations: ScheduledReservation[];
  blocks: ScheduledBlock[];
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

  const [businessHours, dateOverrides, reservations, blocks] = await Promise.all([
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
    prisma.block.findMany({
      where: { tenantId, date, OR: [{ staffId: null }, { staffId: { in: staffIds } }] },
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
    // 店舗全体のブロックは全スタッフの列に出す
    blocks: blocks
      .filter((b) => b.staffId === null || b.staffId === staff.id)
      .map((b) => ({
        id: b.id,
        startMinutes: b.startMinutes,
        endMinutes: b.endMinutes,
        reason: b.reason,
        wholeShop: b.staffId === null,
      })),
  }));

  // 勤務時間と予約が全部収まるように表示範囲を決める
  const points = columns.flatMap((c) => [
    ...c.working.flatMap((w) => [w.start, w.end]),
    ...c.reservations.flatMap((r) => [r.startMinutes, r.endMinutes]),
    ...c.blocks.flatMap((b) => [b.startMinutes, b.endMinutes]),
  ]);

  const viewStart =
    points.length > 0 ? Math.floor(Math.min(...points) / 60) * 60 : DEFAULT_VIEW_START;
  const viewEnd =
    points.length > 0 ? Math.ceil(Math.max(...points) / 60) * 60 : DEFAULT_VIEW_END;

  return { date, columns, viewStart, viewEnd };
}

// ── 週表示 ────────────────────────────────

export type WeekDayCell = {
  date: string;
  /** その日、このスタッフが1件も勤務時間を持たない（休み） */
  isOff: boolean;
  reservations: ScheduledReservation[];
};

export type WeekStaffRow = {
  staffId: string;
  staffName: string;
  /** 日曜始まりで7日分 */
  days: WeekDayCell[];
};

export type WeekSchedule = {
  /** 週の日曜日 */
  startDate: string;
  dates: string[];
  staffRows: WeekStaffRow[];
};

/**
 * 週表示は「その週はどのくらい混んでいるか」を一目で見るためのもの。
 * 日表示のような分単位の帯ではなく、日ごとにその日の予約を積んで示す。
 */
export async function getWeekSchedule(params: {
  tenantId: string;
  startDate: string; // 週の日曜日
}): Promise<WeekSchedule> {
  const { tenantId, startDate } = params;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const staffs = await prisma.staff.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  const staffIds = staffs.map((s) => s.id);

  const [businessHours, dateOverrides, reservations] = await Promise.all([
    // 週をまたぐので曜日では絞らず、対象スタッフの分をまとめて取る
    prisma.businessHour.findMany({
      where: { tenantId, OR: [{ staffId: null }, { staffId: { in: staffIds } }] },
    }),
    prisma.dateOverride.findMany({
      where: {
        tenantId,
        date: { in: dates },
        OR: [{ staffId: null }, { staffId: { in: staffIds } }],
      },
    }),
    prisma.reservation.findMany({
      where: { tenantId, date: { in: dates }, staffId: { in: staffIds }, status: "booked" },
      include: { customer: true },
      orderBy: [{ date: "asc" }, { startMinutes: "asc" }],
    }),
  ]);

  const staffRows: WeekStaffRow[] = staffs.map((staff) => ({
    staffId: staff.id,
    staffName: staff.name,
    days: dates.map((date) => {
      const working = resolveWorkingIntervals({
        staffId: staff.id,
        businessHours: businessHours.filter((h) => h.dayOfWeek === dayOfWeekOf(date)),
        dateOverrides: dateOverrides.filter((o) => o.date === date),
      });

      return {
        date,
        isOff: working.length === 0,
        reservations: reservations
          .filter((r) => r.staffId === staff.id && r.date === date)
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
      };
    }),
  }));

  return { startDate, dates, staffRows };
}
