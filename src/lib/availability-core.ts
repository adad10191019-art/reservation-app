/**
 * 空き枠の計算のうち、DBを一切触らない部分。
 * ここが正しければ、あとは「DBから正しく値を渡せているか」だけの問題になる。
 */
import {
  type Interval,
  generateStarts,
  intersect,
  normalize,
  subtract,
} from "./time";

export type BusinessHourRow = {
  staffId: string | null; // null なら店舗全体
  startMinutes: number;
  endMinutes: number;
};

export type DateOverrideRow = {
  staffId: string | null; // null なら店舗全体
  isClosed: boolean;
  startMinutes: number | null;
  endMinutes: number | null;
};

/**
 * 例外日の行を、勤務できる時間帯の一覧に変える。
 *
 * 同じ日に複数行あってもよい。
 * 「その日は 10:00-13:00 と 16:00-20:00」のような分割シフトは、2行で表す。
 *
 * @returns null なら終日休み
 */
function overridesToIntervals(rows: DateOverrideRow[]): Interval[] | null {
  if (rows.length === 0) return [];
  // 1行でも終日休みがあれば、その日は休み
  if (rows.some((o) => o.isClosed)) return null;

  const intervals = rows
    .filter((o) => o.startMinutes !== null && o.endMinutes !== null)
    .map((o) => ({ start: o.startMinutes as number, end: o.endMinutes as number }));

  return normalize(intervals);
}

/**
 * その日そのスタッフが勤務できる時間帯を求める。
 *
 * 適用順
 *   1. スタッフ個別の営業時間があればそれを使い、なければ店舗全体の営業時間を使う
 *   2. スタッフ個別の例外日があれば、その日の勤務時間を置き換える（終日休みなら空）
 *   3. 店舗全体の例外日は全スタッフに掛かる（終日休みなら空、短縮営業なら重なりを取る）
 *
 * 例外日は1日に複数行を持てるので、分割シフトも表現できる。
 */
export function resolveWorkingIntervals(params: {
  staffId: string;
  businessHours: BusinessHourRow[];
  dateOverrides: DateOverrideRow[];
}): Interval[] {
  const { staffId, businessHours, dateOverrides } = params;

  const own = businessHours.filter((h) => h.staffId === staffId);
  const shopWide = businessHours.filter((h) => h.staffId === null);
  const source = own.length > 0 ? own : shopWide;

  let working = normalize(
    source.map((h) => ({ start: h.startMinutes, end: h.endMinutes })),
  );

  // スタッフ個別の例外（あればその日の勤務時間を置き換える）
  const staffIntervals = overridesToIntervals(
    dateOverrides.filter((o) => o.staffId === staffId),
  );
  if (staffIntervals === null) return [];
  if (staffIntervals.length > 0) working = staffIntervals;

  // 店舗全体の例外（全スタッフに掛かる）
  const shopIntervals = overridesToIntervals(dateOverrides.filter((o) => o.staffId === null));
  if (shopIntervals === null) return [];
  if (shopIntervals.length > 0) working = intersect(working, shopIntervals);

  return working;
}

/** 勤務時間帯から予約済みを引いて、開始できる時刻を出す */
export function computeStarts(params: {
  working: Interval[];
  busy: Interval[];
  requiredMinutes: number;
  slotMinutes: number;
}): number[] {
  const free = subtract(params.working, params.busy);
  return generateStarts(free, params.requiredMinutes, params.slotMinutes);
}

/** start〜end が、いずれかの勤務時間帯にすっぽり収まっているか */
export function isWithinWorking(
  working: Interval[],
  start: number,
  end: number,
): boolean {
  return working.some((w) => w.start <= start && end <= w.end);
}
