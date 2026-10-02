/**
 * 予定の開始・終了を「一覧から選ぶ」ための選択肢と初期値。
 *
 * ブラウザ標準の時刻欄（type="time"）は機種ごとに部品が違い、Android の時計型・キーボード型は
 * 分を1つずつ合わせることになって入力が面倒だった。そこで15分刻みの一覧と「30分」「1時間」の
 * ボタンで選ばせる（部品は components/time-range-fields.tsx）。DBもCookieも触らない純粋な処理。
 */
import { toJstDateString } from "./time";

export const SLOT_MINUTES = 15;
const DAY_END = 24 * 60;
const DEFAULT_START = 9 * 60;
const DEFAULT_LENGTH = 60;

/** 「30分」「1時間」などのボタンで選べる長さ（分） */
export const LENGTH_CHOICES = [30, 60, 90, 120] as const;

/** 開始に選べる時刻（0:00〜23:45、15分刻み） */
export function startChoices(): number[] {
  const list: number[] = [];
  for (let m = 0; m < DAY_END; m += SLOT_MINUTES) list.push(m);
  return list;
}

/** 終了に選べる時刻（開始の15分後〜24:00） */
export function endChoices(start: number): number[] {
  const list: number[] = [];
  for (let m = start + SLOT_MINUTES; m <= DAY_END; m += SLOT_MINUTES) list.push(m);
  return list;
}

/**
 * 最初に選ばれている開始時刻。
 * 今日なら「今の次の15分単位」（14:07 → 14:15）、それ以外の日は 9:00。
 * 夜遅くで1時間の枠が取れないときは 23:00 にとどめる。
 */
export function defaultStart(date: string, now: Date): number {
  if (date !== toJstDateString(now)) return DEFAULT_START;
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const minutes = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  const next = Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
  return Math.min(next, DAY_END - DEFAULT_LENGTH);
}

/** 開始と長さから終了を決める（24:00 を超えない） */
export function endFor(start: number, length: number): number {
  return Math.min(start + length, DAY_END);
}

export function defaultEnd(start: number): number {
  return endFor(start, DEFAULT_LENGTH);
}

/** 60 → "1時間"、90 → "1時間30分"、30 → "30分" */
export function lengthLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}
