/**
 * 空き枠の計算（DBから読む部分）。
 * 計算そのものは availability-core.ts にある。ここは値を集めて渡すだけ。
 */
import { prisma } from "./prisma";
import { computeStarts, resolveWorkingIntervals } from "./availability-core";
import { dayOfWeekOf } from "./time";

export type StaffAvailability = {
  staffId: string;
  staffName: string;
  starts: number[];
};

/** 「誰でもいい」で見たときの1枠。その時刻に対応できるスタッフを持つ */
export type MergedSlot = {
  startMinutes: number;
  staffIds: string[];
};

export type AvailabilityResult = {
  date: string;
  requiredMinutes: number;
  slotMinutes: number;
  perStaff: StaffAvailability[];
  merged: MergedSlot[];
  /** 「誰でもいいので最短」。空きがなければ null */
  earliest: MergedSlot | null;
};

/**
 * staffId を渡せばそのスタッフだけ、省略すれば「誰でもいい」扱いで全員を対象にする。
 */
export async function findAvailability(params: {
  tenantId: string;
  date: string; // "YYYY-MM-DD"
  menuId: string;
  staffId?: string;
  /**
   * 枠を塞ぐ対象から外す予約。
   * 既存の予約を変更するとき、その予約自身で埋まって見えないようにするために使う。
   */
  excludeReservationId?: string;
}): Promise<AvailabilityResult> {
  const { tenantId, date, menuId, staffId, excludeReservationId } = params;
  const dayOfWeek = dayOfWeekOf(date);

  // どれもお互いの結果を必要としないので、まとめて投げる。
  // 1件ずつ待つとDBとの往復がそのまま合計時間になり、空き枠の検索や
  // 予約詳細を開くたびに待たされる原因になる。
  const [tenant, menu, staffMenus] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    // tenantId を必ず条件に入れる。入れ忘れると他店舗のデータが混ざる。
    prisma.menu.findFirst({ where: { id: menuId, tenantId } }),
    prisma.staffMenu.findMany({
      where: {
        tenantId,
        menuId,
        staff: { isActive: true, ...(staffId ? { id: staffId } : {}) },
      },
      include: { staff: true },
    }),
  ]);
  if (!tenant) throw new Error("店舗が見つかりません");
  if (!menu) throw new Error("メニューが見つかりません");

  const requiredMinutes = menu.durationMinutes + menu.bufferMinutes;
  const slotMinutes = tenant.slotMinutes;
  const staffs = staffMenus
    .map((sm) => sm.staff)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  if (staffs.length === 0) {
    return { date, requiredMinutes, slotMinutes, perStaff: [], merged: [], earliest: null };
  }

  const staffIds = staffs.map((s) => s.id);

  const [businessHours, dateOverrides, reservations, blocks] = await Promise.all([
    prisma.businessHour.findMany({
      where: {
        tenantId,
        dayOfWeek,
        OR: [{ staffId: null }, { staffId: { in: staffIds } }],
      },
    }),
    prisma.dateOverride.findMany({
      where: {
        tenantId,
        date,
        OR: [{ staffId: null }, { staffId: { in: staffIds } }],
      },
    }),
    prisma.reservation.findMany({
      where: {
        tenantId,
        date,
        staffId: { in: staffIds },
        status: "booked", // キャンセル済みは枠を塞がない
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
    }),
    // 予約以外で塞がっている時間（会議・清掃など）
    prisma.block.findMany({
      where: {
        tenantId,
        date,
        OR: [{ staffId: null }, { staffId: { in: staffIds } }],
      },
    }),
  ]);

  const perStaff: StaffAvailability[] = staffs.map((staff) => {
    const working = resolveWorkingIntervals({
      staffId: staff.id,
      businessHours,
      dateOverrides,
    });
    // 予約と、予約以外のブロック枠の両方が枠を塞ぐ。
    // staffId が null のブロックは全スタッフに掛かる。
    const busy = [
      ...reservations.filter((r) => r.staffId === staff.id),
      ...blocks.filter((b) => b.staffId === null || b.staffId === staff.id),
    ].map((x) => ({ start: x.startMinutes, end: x.endMinutes }));

    return {
      staffId: staff.id,
      staffName: staff.name,
      starts: computeStarts({ working, busy, requiredMinutes, slotMinutes }),
    };
  });

  const byStart = new Map<number, string[]>();
  for (const s of perStaff) {
    for (const start of s.starts) {
      const list = byStart.get(start);
      if (list) list.push(s.staffId);
      else byStart.set(start, [s.staffId]);
    }
  }
  const merged: MergedSlot[] = [...byStart.entries()]
    .map(([startMinutes, ids]) => ({ startMinutes, staffIds: ids }))
    .sort((a, b) => a.startMinutes - b.startMinutes);

  return {
    date,
    requiredMinutes,
    slotMinutes,
    perStaff,
    merged,
    earliest: merged[0] ?? null,
  };
}

export type DayAvailability = {
  date: string;
  /** 「誰でもいい」でまとめた、開始できる時刻（受付期間・締め切りでの絞り込み前） */
  starts: number[];
};

/**
 * 複数日分の空き状況を、まとめて低コストで求める。
 *
 * findAvailability を日数ぶん呼ぶと、その回数だけDBへの往復が増える。
 * ここでは「店舗・メニュー・対応スタッフ」は1回、その他は
 * 対象の日付をまとめて1回の問い合わせで取り、日数が増えても
 * 往復の回数を増やさない（1日分を見るのと同じコストで済む）。
 *
 * 受付期間・締め切りでの絞り込みは呼び出し側（filterBookableStarts）に任せる。
 * 単日の findAvailability と役割を揃えるため。
 */
export async function findWeekAvailability(params: {
  tenantId: string;
  dates: string[]; // "YYYY-MM-DD" の配列。連続していなくてもよい
  menuId: string;
  staffId?: string;
}): Promise<DayAvailability[]> {
  const { tenantId, dates, menuId, staffId } = params;
  const empty = dates.map((date) => ({ date, starts: [] as number[] }));

  const [tenant, menu, staffMenus] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.menu.findFirst({ where: { id: menuId, tenantId } }),
    prisma.staffMenu.findMany({
      where: {
        tenantId,
        menuId,
        staff: { isActive: true, ...(staffId ? { id: staffId } : {}) },
      },
      include: { staff: true },
    }),
  ]);
  if (!tenant || !menu) return empty;

  const requiredMinutes = menu.durationMinutes + menu.bufferMinutes;
  const slotMinutes = tenant.slotMinutes;
  const staffs = staffMenus
    .map((sm) => sm.staff)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  if (staffs.length === 0) return empty;

  const staffIds = staffs.map((s) => s.id);

  const [businessHours, dateOverrides, reservations, blocks] = await Promise.all([
    // 曜日では絞らず、対象スタッフの分をまとめて取る（複数日にまたがるため）
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
    }),
    prisma.block.findMany({
      where: {
        tenantId,
        date: { in: dates },
        OR: [{ staffId: null }, { staffId: { in: staffIds } }],
      },
    }),
  ]);

  return dates.map((date) => {
    const dayOfWeek = dayOfWeekOf(date);
    const startsByStaff = staffs.map((staff) => {
      const working = resolveWorkingIntervals({
        staffId: staff.id,
        businessHours: businessHours.filter((h) => h.dayOfWeek === dayOfWeek),
        dateOverrides: dateOverrides.filter((o) => o.date === date),
      });
      const busy = [
        ...reservations.filter((r) => r.staffId === staff.id && r.date === date),
        ...blocks.filter(
          (b) => (b.staffId === null || b.staffId === staff.id) && b.date === date,
        ),
      ].map((x) => ({ start: x.startMinutes, end: x.endMinutes }));

      return computeStarts({ working, busy, requiredMinutes, slotMinutes });
    });

    const starts = [...new Set(startsByStaff.flat())].sort((a, b) => a - b);
    return { date, starts };
  });
}
