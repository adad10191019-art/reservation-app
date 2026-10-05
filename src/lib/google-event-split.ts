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

/**
 * 全体スケジュールに出す Google の予定1件。title は件名を出さない設定なら null。
 * id は Google の予定のID（アプリから直す・消すのに使う。2026-10-05 より前の控えには無い）。
 * editable は、その日の中で収まる予定か（何日にもまたがる予定は、1日分の画面から直すと形が崩れるので直させない）
 */
export type GoogleEventItem = { start: number; end: number; title: string | null; id?: string; editable?: boolean };

export type GoogleEvent = {
  id?: string;
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

    const spansDays = spansSeveralDays(e);
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
        ...(e.id ? { id: e.id, editable: !spansDays } : {}),
      });
    }
  }

  for (const list of result.values()) list.sort((a, b) => a.start - b.start || a.end - b.end);
  return result;
}

/** 何日にもまたがる予定か（終日の予定は2日以上、時刻つきは日本時間で開始と終了の日が違えば。終わりがちょうど0時なら前の日のうち） */
function spansSeveralDays(e: GoogleEvent): boolean {
  if (e.start?.date && e.end?.date) {
    return Date.parse(`${e.end.date}T00:00:00Z`) - Date.parse(`${e.start.date}T00:00:00Z`) > 86_400_000;
  }
  if (e.start?.dateTime && e.end?.dateTime) {
    const jstDate = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
    return jstDate(Date.parse(e.start.dateTime)) !== jstDate(Date.parse(e.end.dateTime) - 1);
  }
  return false;
}
