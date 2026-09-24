/**
 * iCalendar（.ics）形式の組み立て。
 * Googleカレンダー等の「URLから予定を購読する」機能向け。
 *
 * 日付・時刻はすべて日本時間（JST, UTC+9固定）として扱う。
 * サマータイムが無いので、常に9時間引くだけでUTCに変換できる。
 */

export type IcsEvent = {
  uid: string;
  date: string; // "YYYY-MM-DD"（JST）
  startMinutes: number;
  endMinutes: number;
  summary: string;
  description?: string;
  location?: string;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toUtcStamp(date: string, minutes: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const utcMs = Date.UTC(y, m - 1, d, 0, minutes, 0) - JST_OFFSET_MS;
  return new Date(utcMs).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** カンマ・セミコロン・改行など、ICSで特別な意味を持つ文字をエスケープする */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

export function buildIcsCalendar(params: {
  calendarName: string;
  events: IcsEvent[];
}): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//reservation-app//staff-schedule//JA",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(params.calendarName)}`,
    // 更新頻度の目安（対応しているクライアントのみ）
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const ev of params.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${toUtcStamp(ev.date, ev.startMinutes)}`,
      `DTEND:${toUtcStamp(ev.date, ev.endMinutes)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
    );
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
