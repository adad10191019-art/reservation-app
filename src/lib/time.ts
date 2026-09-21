/**
 * 時間帯の計算。
 * 時刻はすべて「0時からの経過分」の整数で扱う（10:00 = 600）。
 * ここにはDBの知識を持ち込まない。純粋な計算だけを置く。
 */

/** 時間帯。start は含み、end は含まない（10:00-13:00 と 13:00-14:00 は重ならない） */
export type Interval = { start: number; end: number };

/** "10:30" → 630 */
export function hm(text: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!m) throw new Error(`時刻の形式が不正です: ${text}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 630 → "10:30" */
export function toHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * "YYYY-MM-DD" → 曜日（0=日曜 〜 6=土曜）
 * new Date("2026-09-21") はUTCとして解釈されるため、
 * ローカル時間にずれないよう UTC のまま曜日を取る。
 */
export function dayOfWeekOf(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`日付の形式が不正です: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

/** 長さ0以下を捨て、並べ替えて、重なり・隣接をまとめる */
export function normalize(intervals: Interval[]): Interval[] {
  const valid = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const out: Interval[] = [];
  for (const cur of valid) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      // 重なっている、または隣接している → つなげる
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** a と b の両方に含まれる時間帯 */
export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const x = normalize(a);
  const y = normalize(b);
  const out: Interval[] = [];

  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const start = Math.max(x[i].start, y[j].start);
    const end = Math.min(x[i].end, y[j].end);
    if (end > start) out.push({ start, end });

    // 先に終わるほうを進める
    if (x[i].end < y[j].end) i++;
    else j++;
  }
  return out;
}

/** base から cut の時間帯を取り除く */
export function subtract(base: Interval[], cut: Interval[]): Interval[] {
  const cuts = normalize(cut);
  let result = normalize(base);

  for (const c of cuts) {
    const next: Interval[] = [];
    for (const b of result) {
      if (c.end <= b.start || c.start >= b.end) {
        // 重なっていない
        next.push(b);
        continue;
      }
      // 左側に残りがあれば残す
      if (c.start > b.start) next.push({ start: b.start, end: c.start });
      // 右側に残りがあれば残す
      if (c.end < b.end) next.push({ start: c.end, end: b.end });
    }
    result = next;
  }
  return result;
}

/**
 * 空き時間帯から、予約を開始できる時刻を拾う。
 * 開始時刻は slotMinutes の倍数（0時起点）に揃える。
 */
export function generateStarts(
  free: Interval[],
  requiredMinutes: number,
  slotMinutes: number,
): number[] {
  if (requiredMinutes <= 0) throw new Error("所要時間は1分以上である必要があります");
  if (slotMinutes <= 0) throw new Error("予約枠の刻みは1分以上である必要があります");

  const out: number[] = [];
  for (const interval of normalize(free)) {
    // 区間の先頭以降で、最初に刻みに乗る時刻
    let start = Math.ceil(interval.start / slotMinutes) * slotMinutes;
    while (start + requiredMinutes <= interval.end) {
      out.push(start);
      start += slotMinutes;
    }
  }
  return out.sort((a, b) => a - b);
}

// ── 日付文字列（"YYYY-MM-DD"）の操作 ──────────────

/** Date を "YYYY-MM-DD" にする（ローカル時間で） */
export function toDateString(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** 今日の "YYYY-MM-DD" */
export function todayString(): string {
  return toDateString(new Date());
}

/** "YYYY-MM-DD" に日数を足す */
export function addDays(date: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`日付の形式が不正です: ${date}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** "YYYY-MM-DD" を受け取り、形式が正しくなければ今日を返す */
export function sanitizeDate(date: string | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return todayString();
  const [y, m, d] = date.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  // 2026-02-31 のような存在しない日付をはじく
  if (parsed.getMonth() !== m - 1 || parsed.getDate() !== d) return todayString();
  return date;
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-09-21" → "9月21日(月)" */
export function formatDateLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日(${WEEKDAY_JA[dayOfWeekOf(date)]})`;
}
