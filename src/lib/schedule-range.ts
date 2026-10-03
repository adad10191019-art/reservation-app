/**
 * 全体スケジュール・自分の予定の「日・週・月」の切り替えで使う、日付の計算。
 * 週は月曜はじまり（ユーザーと確認済み、2026-10-03。店舗カレンダーの週表示は日曜はじまりのまま）。
 * DBもCookieも触らない純粋な処理なので、そのままテストできる。
 */
import { addDays, dayOfWeekOf, formatDateLabel } from "./time";

export type ScheduleView = "day" | "week" | "month";

export function parseView(value: string | undefined): ScheduleView {
  return value === "week" || value === "month" ? value : "day";
}

/** その日を含む週の月曜日 */
export function mondayOf(date: string): string {
  return addDays(date, -((dayOfWeekOf(date) + 6) % 7));
}

/** その日を含む週の7日分（月〜日） */
export function weekDates(date: string): string[] {
  const monday = mondayOf(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** その月のカレンダーのマス目。1行＝月〜日の7日。前後の月の日も入る */
export function monthWeeks(date: string): string[][] {
  const first = `${date.slice(0, 7)}-01`;
  const month = date.slice(0, 7);
  const weeks: string[][] = [];
  let monday = mondayOf(first);
  while (weeks.length === 0 || monday.slice(0, 7) === month) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
    monday = addDays(monday, 7);
  }
  return weeks;
}

/** 表示している範囲の全部の日付（DB・Google から読む範囲） */
export function viewDates(view: ScheduleView, date: string): string[] {
  if (view === "week") return weekDates(date);
  if (view === "month") return monthWeeks(date).flat();
  return [date];
}

/** 月を足す。31日→翌月に31日が無ければ、その月の末日にする */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, "0"),
    String(Math.min(d, lastDay)).padStart(2, "0"),
  ].join("-");
}

/** 「前へ」「次へ」で動かした先の日付 */
export function shiftDate(view: ScheduleView, date: string, direction: 1 | -1): string {
  if (view === "week") return addDays(date, 7 * direction);
  if (view === "month") return addMonths(date, direction);
  return addDays(date, direction);
}

/** 今日を含む範囲を見ているか（「今日」「今週」「今月」のボタンを目立たせる） */
export function containsToday(view: ScheduleView, date: string, today: string): boolean {
  if (view === "week") return mondayOf(date) === mondayOf(today);
  if (view === "month") return date.slice(0, 7) === today.slice(0, 7);
  return date === today;
}

/** 見出し。日＝「10月3日(土)」、週＝「9月28日(月)〜10月4日(日)」、月＝「2026年10月」 */
export function viewTitle(view: ScheduleView, date: string): string {
  if (view === "week") {
    const days = weekDates(date);
    return `${formatDateLabel(days[0])}〜${formatDateLabel(days[6])}`;
  }
  if (view === "month") {
    const [y, m] = date.split("-").map(Number);
    return `${y}年${m}月`;
  }
  return formatDateLabel(date);
}

export const NAV_LABELS: Record<ScheduleView, { prev: string; current: string; next: string }> = {
  day: { prev: "← 前日", current: "今日", next: "翌日 →" },
  week: { prev: "← 前週", current: "今週", next: "翌週 →" },
  month: { prev: "← 前月", current: "今月", next: "翌月 →" },
};

/**
 * 予定を足した・消したあとに戻る先。フォームから来る値なので、決まった画面の中だけを通す
 * （それ以外なら、その日の1日表示に戻す）。表示（日・週・月）と選んだ人はそのままで、
 * 日付は足した・消した予定の日にする（先の日に入れたら、その日を含む週・月が出る）。
 */
export function safeReturnPath(value: unknown, basePath: string, date: string): string {
  const fallback = `${basePath}?date=${encodeURIComponent(date)}`;
  if (typeof value !== "string" || !value.startsWith(`${basePath}?`)) return fallback;
  const params = new URLSearchParams(value.slice(basePath.length + 1));
  // 戻り先にもう付いている結果の知らせは外して、付け直す
  params.delete("error");
  params.delete("done");
  params.set("date", date);
  return `${basePath}?${params.toString()}`;
}
