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
 * その日そのスタッフが勤務できる時間帯を求める。
 *
 * 適用順
 *   1. スタッフ個別の営業時間があればそれを使い、なければ店舗全体の営業時間を使う
 *   2. スタッフ個別の例外日があれば、その日の勤務時間を置き換える（終日休みなら空）
 *   3. 店舗全体の例外日は全スタッフに掛かる（終日休みなら空、短縮営業なら重なりを取る）
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

  const staffOverride = dateOverrides.find((o) => o.staffId === staffId);
  if (staffOverride) {
    if (staffOverride.isClosed) return [];
    if (staffOverride.startMinutes !== null && staffOverride.endMinutes !== null) {
      working = normalize([
        { start: staffOverride.startMinutes, end: staffOverride.endMinutes },
      ]);
    }
  }

  const shopOverride = dateOverrides.find((o) => o.staffId === null);
  if (shopOverride) {
    if (shopOverride.isClosed) return [];
    if (shopOverride.startMinutes !== null && shopOverride.endMinutes !== null) {
      working = intersect(working, [
        { start: shopOverride.startMinutes, end: shopOverride.endMinutes },
      ]);
    }
  }

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
