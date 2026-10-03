/**
 * 空き枠の計算（DBから読む部分）。
 * 計算そのものは availability-core.ts にある。ここは値を集めて渡すだけ。
 */
import { prisma } from "./prisma";
import { computeStarts, resolveWorkingIntervals } from "./availability-core";
import { fetchGoogleBusyByDate, isGoogleCalendarConfigured } from "./google-calendar";
import { fetchPersonBusy } from "./person-busy";
import { dayOfWeekOf } from "./time";

/**
 * 対象スタッフのうち、その人（名簿）が Google カレンダーをつないでいる分だけ、
 * 指定した日付ぶんの busy（分単位）をまとめて取ってくる。
 * 連携は人に付くので、兼任先の部署からつないだ分もここで効く。
 * つないでいない・名簿とひも付いていないスタッフは入らない。
 */
async function fetchGoogleBusyByStaff(
  staffIds: string[],
  dates: string[],
): Promise<Map<string, Map<string, { start: number; end: number }[]>>> {
  const result = new Map<string, Map<string, { start: number; end: number }[]>>();
  if (!isGoogleCalendarConfigured() || staffIds.length === 0) return result;

  const staffs = await prisma.staff.findMany({
    where: { id: { in: staffIds }, employeeId: { not: null } },
    select: { id: true, employeeId: true },
  });
  if (staffs.length === 0) return result;

  const connections = await prisma.googleCalendarConnection.findMany({
    where: { employeeId: { in: staffs.map((s) => s.employeeId!) } },
  });
  if (connections.length === 0) return result;

  await Promise.all(
    connections.map(async (connection) => {
      const busyByDate = await fetchGoogleBusyByDate(connection, dates);
      for (const staff of staffs) {
        if (staff.employeeId === connection.employeeId) result.set(staff.id, busyByDate);
      }
    }),
  );
  return result;
}

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
 * 複数の日付の空き枠を、まとめて求める。
 *
 * 日付ごとに問い合わせると、日数ぶんDB（とGoogle）への往復が増える。
 * ここでは「店舗・メニュー・対応スタッフ」は1回、その他は対象の日付を
 * まとめて1回の問い合わせで取り、日数が増えても往復の回数を増やさない。
 *
 * staffId を渡せばそのスタッフだけ、省略すれば「誰でもいい」扱いで全員を対象にする。
 * 受付期間・締め切りでの絞り込みは呼び出し側（filterBookableStarts）に任せる。
 */
export async function findAvailabilityForDates(params: {
  tenantId: string;
  dates: string[]; // "YYYY-MM-DD" の配列。連続していなくてもよい
  menuId: string;
  staffId?: string;
  /**
   * 枠を塞ぐ対象から外す予約。
   * 既存の予約を変更するとき、その予約自身で埋まって見えないようにするために使う。
   */
  excludeReservationId?: string;
}): Promise<Map<string, AvailabilityResult>> {
  const { tenantId, dates, menuId, staffId, excludeReservationId } = params;

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

  const result = new Map<string, AvailabilityResult>();
  if (staffs.length === 0) {
    for (const date of dates) {
      result.set(date, { date, requiredMinutes, slotMinutes, perStaff: [], merged: [], earliest: null });
    }
    return result;
  }

  const staffIds = staffs.map((s) => s.id);
  const daysOfWeek = [...new Set(dates.map(dayOfWeekOf))];

  const [businessHours, dateOverrides, reservations, blocks, googleBusyByStaff, personBusy] =
    await Promise.all([
      prisma.businessHour.findMany({
        where: {
          tenantId,
          dayOfWeek: { in: daysOfWeek },
          OR: [{ staffId: null }, { staffId: { in: staffIds } }],
        },
      }),
      prisma.dateOverride.findMany({
        where: {
          tenantId,
          date: { in: dates },
          OR: [{ staffId: null }, { staffId: { in: staffIds } }],
        },
      }),
      prisma.reservation.findMany({
        where: {
          tenantId,
          date: { in: dates },
          staffId: { in: staffIds },
          status: "booked", // キャンセル済みは枠を塞がない
          ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
        },
      }),
      // 予約以外で塞がっている時間（会議・清掃など）
      prisma.block.findMany({
        where: {
          tenantId,
          date: { in: dates },
          OR: [{ staffId: null }, { staffId: { in: staffIds } }],
        },
      }),
      // 本人のGoogleカレンダーにある予定（連携している人だけ）。
      // 対象の日付をまとめて1回のAPI呼び出しで済ませる
      fetchGoogleBusyByStaff(staffIds, dates),
      // 兼任先の部署での予約・予定と、その人自身の予定（社員名簿でひも付いている人だけ）。
      // 時間帯だけが返り、他部署の中身はここには来ない
      fetchPersonBusy(prisma, { staffIds, dates, excludeReservationId }),
    ]);

  for (const date of dates) {
    const dayOfWeek = dayOfWeekOf(date);
    const hoursOfDay = businessHours.filter((h) => h.dayOfWeek === dayOfWeek);
    const overridesOfDay = dateOverrides.filter((o) => o.date === date);

    const perStaff: StaffAvailability[] = staffs.map((staff) => {
      const working = resolveWorkingIntervals({
        staffId: staff.id,
        businessHours: hoursOfDay,
        dateOverrides: overridesOfDay,
      });
      // 予約・予約以外のブロック枠・Googleカレンダーの予定・他部署を含めたその人の予定、すべてが枠を塞ぐ。
      // staffId が null のブロックは全スタッフに掛かる。
      const busy = [
        ...reservations
          .filter((r) => r.staffId === staff.id && r.date === date)
          .map((r) => ({ start: r.startMinutes, end: r.endMinutes })),
        ...blocks
          .filter((b) => (b.staffId === null || b.staffId === staff.id) && b.date === date)
          .map((b) => ({ start: b.startMinutes, end: b.endMinutes })),
        ...(googleBusyByStaff.get(staff.id)?.get(date) ?? []),
        ...(personBusy.get(staff.id)?.get(date) ?? []),
      ];

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

    result.set(date, {
      date,
      requiredMinutes,
      slotMinutes,
      perStaff,
      merged,
      earliest: merged[0] ?? null,
    });
  }

  return result;
}

/** 1日分の空き枠。findAvailabilityForDates に日付を1つだけ渡したもの */
export async function findAvailability(params: {
  tenantId: string;
  date: string; // "YYYY-MM-DD"
  menuId: string;
  staffId?: string;
  excludeReservationId?: string;
}): Promise<AvailabilityResult> {
  const { date, ...rest } = params;
  const result = await findAvailabilityForDates({ ...rest, dates: [date] });
  return result.get(date)!;
}
