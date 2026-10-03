/**
 * Google カレンダーから取ってきた予定（events.list の結果）を、日付ごとの「0時からの分」に分ける。
 * 週・月の表示では何日分かをまとめて1回で取るので、日をまたぐ予定はその日ごとに切って入れる。
 * DBもCookieも触らない純粋な処理なので、そのままテストできる。
 *
 *   ・空き枠の計算（freeBusy）とそろえて、「予定なし」（transparency=transparent。終日の予定はふつうこれ）と
 *     キャンセル済みは出さない
 *   ・Google 側で「非公開」にした予定は、件名を出す設定でも件名を出さない
 */
import { dateMinutesToUtcIso } from "./time";

/** 全体スケジュールに出す Google の予定1件。title は件名を出さない設定なら null */
export type GoogleEventItem = { start: number; end: number; title: string | null };

export type GoogleEvent = {
  status?: string;
  summary?: string;
  visibility?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export function splitGoogleEventsByDate(
  events: GoogleEvent[],
  dates: string[],
  withTitles: boolean,
): Map<string, GoogleEventItem[]> {
  const result = new Map<string, GoogleEventItem[]>(dates.map((d) => [d, []]));
  const days = dates.map((date) => ({
    date,
    startMs: new Date(dateMinutesToUtcIso(date, 0)).getTime(),
    endMs: new Date(dateMinutesToUtcIso(date, 24 * 60)).getTime(),
  }));

  for (const e of events) {
    if (e.status === "cancelled" || e.transparency === "transparent") continue;
    const hidden = e.visibility === "private" || e.visibility === "confidential";
    const title = withTitles && !hidden && e.summary ? e.summary.slice(0, 100) : null;

    for (const day of days) {
      let s: number;
      let t: number;
      if (e.start?.dateTime && e.end?.dateTime) {
        s = Math.max(new Date(e.start.dateTime).getTime(), day.startMs);
        t = Math.min(new Date(e.end.dateTime).getTime(), day.endMs);
      } else if (e.start?.date && e.end?.date) {
        // 終日の予定（「予定あり」にしたもの）。終わりの日付はその日を含まない
        if (!(e.start.date <= day.date && day.date < e.end.date)) continue;
        s = day.startMs;
        t = day.endMs;
      } else {
        break;
      }
      if (t <= s) continue;
      result.get(day.date)!.push({
        start: Math.round((s - day.startMs) / 60000),
        end: Math.round((t - day.startMs) / 60000),
        title,
      });
    }
  }

  for (const list of result.values()) list.sort((a, b) => a.start - b.start || a.end - b.end);
  return result;
}
