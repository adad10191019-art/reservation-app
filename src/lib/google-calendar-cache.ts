/**
 * 全体スケジュールに出す Google の予定を、人・日付ごとに少しの間だけ覚えておく。
 *
 * 数十人がつないでいると、全体スケジュールを開くたびに Google へ数十回問い合わせることになり遅くなる。
 * そこで取ってきた予定を GoogleEventCache に入れ、CACHE_MINUTES の間は問い合わせない
 * （Google で予定を変えてから全体スケジュールに出るまで、最大でこの分だけ遅れる。ユーザーと確認済み、2026-10-03）。
 * 何分覚えておくか・覚えた分を読み戻す判定は google-cache-rules.ts（DB を使わずテストできる）。
 *
 * 空き枠の計算（予約の受付）はここを使わず、毎回その場で Google に確かめる（二重予約を増やさないため）。
 */
import { prisma } from "./prisma";
import { type GoogleEventItem, fetchGoogleEventsOfDates, isGoogleCalendarConfigured } from "./google-calendar";
import { isCacheFresh, parseCachedItems } from "./google-cache-rules";

export { CACHE_MINUTES } from "./google-cache-rules";

/**
 * 名簿の人ID → 日付 → その日の Google の予定（つないでいない人は入らない）。
 * 週・月の表示では何日分かを一度に頼まれる。全部の日の控えが新しければ Google に問い合わせず、
 * 1日でも古い・無い日があれば、その人の分は全部の日をまとめて1回で取り直す。
 */
export async function getGoogleEventsForTeam(
  employeeIds: string[],
  dates: string[],
): Promise<Map<string, Map<string, GoogleEventItem[]>>> {
  const result = new Map<string, Map<string, GoogleEventItem[]>>();
  if (!isGoogleCalendarConfigured() || employeeIds.length === 0 || dates.length === 0) return result;

  const [connections, caches] = await Promise.all([
    prisma.googleCalendarConnection.findMany({ where: { employeeId: { in: employeeIds } } }),
    prisma.googleEventCache.findMany({ where: { employeeId: { in: employeeIds }, date: { in: dates } } }),
  ]);
  const now = new Date();

  await Promise.all(
    connections.map(async (connection) => {
      const cacheOf = new Map(
        caches.filter((c) => c.employeeId === connection.employeeId).map((c) => [c.date, c]),
      );
      const fromCache = () =>
        new Map(dates.map((d) => [d, cacheOf.has(d) ? parseCachedItems(cacheOf.get(d)!.items) : []]));

      if (dates.every((d) => cacheOf.has(d) && isCacheFresh(cacheOf.get(d)!.fetchedAt, now))) {
        result.set(connection.employeeId, fromCache());
        return;
      }

      const fetched = await fetchGoogleEventsOfDates(connection, dates, connection.showTitles);
      if (fetched === null) {
        // 問い合わせられなかったときは、古くても前回の分を出す（無ければ何も出さない）
        result.set(connection.employeeId, fromCache());
        return;
      }

      result.set(connection.employeeId, fetched);
      await prisma.$transaction([
        prisma.googleEventCache.deleteMany({
          where: { employeeId: connection.employeeId, date: { in: dates } },
        }),
        prisma.googleEventCache.createMany({
          data: dates.map((date) => ({
            employeeId: connection.employeeId,
            date,
            items: fetched.get(date) ?? [],
            fetchedAt: now,
          })),
          // 同じ人の画面を2人が同時に開いて、先に入れられていた日は飛ばす
          skipDuplicates: true,
        }),
      ]);
    }),
  );
  return result;
}

/** 連携を外したとき・件名を出すかを変えたときに、覚えておいた分を捨てる */
export async function clearGoogleEventCache(employeeId: string): Promise<void> {
  await prisma.googleEventCache.deleteMany({ where: { employeeId } });
}
