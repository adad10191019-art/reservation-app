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
import { type GoogleEventItem, fetchGoogleEventsOfDate, isGoogleCalendarConfigured } from "./google-calendar";
import { isCacheFresh, parseCachedItems } from "./google-cache-rules";

export { CACHE_MINUTES } from "./google-cache-rules";

/** 名簿の人ID → その日の Google の予定（つないでいない人は入らない） */
export async function getGoogleEventsForTeam(
  employeeIds: string[],
  date: string,
): Promise<Map<string, GoogleEventItem[]>> {
  const result = new Map<string, GoogleEventItem[]>();
  if (!isGoogleCalendarConfigured() || employeeIds.length === 0) return result;

  const [connections, caches] = await Promise.all([
    prisma.googleCalendarConnection.findMany({ where: { employeeId: { in: employeeIds } } }),
    prisma.googleEventCache.findMany({ where: { employeeId: { in: employeeIds }, date } }),
  ]);
  const cacheOf = new Map(caches.map((c) => [c.employeeId, c]));
  const now = new Date();

  await Promise.all(
    connections.map(async (connection) => {
      const cached = cacheOf.get(connection.employeeId);
      if (cached && isCacheFresh(cached.fetchedAt, now)) {
        result.set(connection.employeeId, parseCachedItems(cached.items));
        return;
      }

      const fetched = await fetchGoogleEventsOfDate(connection, date, connection.showTitles);
      if (fetched === null) {
        // 問い合わせられなかったときは、古くても前回の分を出す（無ければ何も出さない）
        result.set(connection.employeeId, cached ? parseCachedItems(cached.items) : []);
        return;
      }

      result.set(connection.employeeId, fetched);
      await prisma.googleEventCache.upsert({
        where: { employeeId_date: { employeeId: connection.employeeId, date } },
        create: { employeeId: connection.employeeId, date, items: fetched },
        update: { items: fetched, fetchedAt: now },
      });
    }),
  );
  return result;
}

/** 連携を外したとき・件名を出すかを変えたときに、覚えておいた分を捨てる */
export async function clearGoogleEventCache(employeeId: string): Promise<void> {
  await prisma.googleEventCache.deleteMany({ where: { employeeId } });
}
