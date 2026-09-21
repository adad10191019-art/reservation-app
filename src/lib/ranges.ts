/**
 * 「10:00-13:00, 14:00-19:00」のような文字列と、時間帯の一覧を相互に変換する。
 *
 * 営業時間やシフトは1日に複数の区間を持つので、
 * 入力欄を区間の数だけ増やすより、1行で書けるほうが扱いやすい。
 *
 * DBもCookieも触らない純粋な処理。そのままテストできる。
 */
import { type Interval, hm, normalize, toHm } from "./time";

export type ParseResult =
  | { ok: true; intervals: Interval[] }
  | { ok: false; message: string };

/** 時間帯の一覧 → "10:00-13:00, 14:00-19:00" */
export function formatRanges(intervals: Interval[]): string {
  return normalize(intervals)
    .map((i) => `${toHm(i.start)}-${toHm(i.end)}`)
    .join(", ");
}

/**
 * "10:00-13:00, 14:00-19:00" → 時間帯の一覧
 *
 * 空文字は「区間なし（＝休み）」として扱う。
 * 全角の記号やスペースは半角に直してから読む。
 */
export function parseRanges(text: string): ParseResult {
  const cleaned = text
    .replace(/[　]/g, " ")
    .replace(/[：]/g, ":")
    .replace(/[〜～–—ー]/g, "-")
    .replace(/[、，]/g, ",")
    .trim();

  if (cleaned === "") return { ok: true, intervals: [] };

  const intervals: Interval[] = [];

  for (const part of cleaned.split(",")) {
    const piece = part.trim();
    if (piece === "") continue;

    const match = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(piece);
    if (!match) {
      return {
        ok: false,
        message: `「${piece}」の形式が違います。10:00-13:00 のように入力してください`,
      };
    }

    let start: number;
    let end: number;
    try {
      start = hm(match[1]);
      end = hm(match[2]);
    } catch {
      return { ok: false, message: `「${piece}」に使えない時刻があります` };
    }

    if (start >= 24 * 60 || end > 24 * 60) {
      return { ok: false, message: `「${piece}」は24時を超えています` };
    }
    if (end <= start) {
      return { ok: false, message: `「${piece}」は終了が開始より後である必要があります` };
    }

    intervals.push({ start, end });
  }

  // 重なりがあれば知らせる（黙ってつなげると入力ミスに気づけない）
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      return {
        ok: false,
        message: `${toHm(sorted[i - 1].start)}-${toHm(sorted[i - 1].end)} と ${toHm(
          sorted[i].start,
        )}-${toHm(sorted[i].end)} が重なっています`,
      };
    }
  }

  return { ok: true, intervals: sorted };
}
