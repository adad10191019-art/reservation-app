/**
 * 全体スケジュール用に Google の予定を覚えておくときの決まり（google-calendar-cache.ts から使う）。
 * DBもCookieも触らない純粋な処理なので、そのままテストできる。
 */
import type { GoogleEventItem } from "./google-calendar";

export const CACHE_MINUTES = 10;

/** 覚えておいた分がまだ使えるか */
export function isCacheFresh(fetchedAt: Date, now: Date): boolean {
  return now.getTime() - fetchedAt.getTime() < CACHE_MINUTES * 60 * 1000;
}

/** DB に入れた JSON を読み戻す。形がおかしいものは捨てる */
export function parseCachedItems(value: unknown): GoogleEventItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (typeof v !== "object" || v === null) return [];
    const { start, end, title, id, editable } = v as Record<string, unknown>;
    if (typeof start !== "number" || typeof end !== "number") return [];
    return [
      {
        start,
        end,
        title: typeof title === "string" ? title : null,
        ...(typeof id === "string" ? { id, editable: editable === true } : {}),
      },
    ];
  });
}
