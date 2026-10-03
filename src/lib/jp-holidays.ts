/**
 * 日本の祝日（「国民の祝日に関する法律」の今の規則。2022年以降を正しく出す）。
 *
 *   ・日付が決まっている祝日、第2・第3月曜の祝日（ハッピーマンデー）
 *   ・春分の日・秋分の日（天文の計算による近似式。2099年まで使える）
 *   ・振替休日：祝日が日曜なら、その後の祝日でない最初の日
 *   ・国民の休日：前後の日がどちらも祝日の日（9月の敬老の日と秋分の日の間など）
 * 法律が変わったら（オリンピックの年の移動など）ここを直す。
 * DB も時計も使わない純粋な処理なので、そのままテストできる。
 */
import { dayOfWeekOf } from "./time";

const FIXED: [number, number, string][] = [
  [1, 1, "元日"],
  [2, 11, "建国記念の日"],
  [2, 23, "天皇誕生日"],
  [4, 29, "昭和の日"],
  [5, 3, "憲法記念日"],
  [5, 4, "みどりの日"],
  [5, 5, "こどもの日"],
  [8, 11, "山の日"],
  [11, 3, "文化の日"],
  [11, 23, "勤労感謝の日"],
];

/** [月, 第何, 名前]。どれも月曜 */
const HAPPY_MONDAY: [number, number, string][] = [
  [1, 2, "成人の日"],
  [7, 3, "海の日"],
  [9, 3, "敬老の日"],
  [10, 2, "スポーツの日"],
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 日付を n 日ずらす（"YYYY-MM-DD" のまま） */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function nthMonday(year: number, month: number, nth: number): number {
  const firstDow = dayOfWeekOf(ymd(year, month, 1));
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return firstMonday + (nth - 1) * 7;
}

function equinoxDay(year: number, base: number): number {
  const y = year - 1980;
  return Math.floor(base + 0.242194 * y - Math.floor(y / 4));
}

const cache = new Map<number, Map<string, string>>();

/** その年の祝日（日付 → 名前） */
export function holidaysOfYear(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const base = new Map<string, string>();
  for (const [m, d, name] of FIXED) base.set(ymd(year, m, d), name);
  for (const [m, nth, name] of HAPPY_MONDAY) base.set(ymd(year, m, nthMonday(year, m, nth)), name);
  base.set(ymd(year, 3, equinoxDay(year, 20.8431)), "春分の日");
  base.set(ymd(year, 9, equinoxDay(year, 23.2488)), "秋分の日");

  const all = new Map(base);
  for (const date of base.keys()) {
    // 振替休日
    if (dayOfWeekOf(date) === 0) {
      let next = addDays(date, 1);
      while (all.has(next)) next = addDays(next, 1);
      all.set(next, "振替休日");
    }
    // 国民の休日（祝日の2日後も祝日なら、間の日も休み）
    const between = addDays(date, 1);
    if (!all.has(between) && base.has(addDays(date, 2)) && dayOfWeekOf(between) !== 0) {
      all.set(between, "国民の休日");
    }
  }

  cache.set(year, all);
  return all;
}

/** 祝日ならその名前、そうでなければ null */
export function holidayName(date: string): string | null {
  return holidaysOfYear(Number(date.slice(0, 4))).get(date) ?? null;
}

/** 色を付ける日の種類。日曜と祝日は "sun"、土曜は "sat"、ほかは null */
export function dayTint(date: string): "sun" | "sat" | null {
  const dow = dayOfWeekOf(date);
  if (dow === 0 || holidayName(date)) return "sun";
  if (dow === 6) return "sat";
  return null;
}
