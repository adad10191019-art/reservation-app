/**
 * 「自分の予定」の週・月表示に並べる、自分の予定の全部（何日分かまとめて読む）。
 *
 *   ・今選んでいる部署での自分の予約（メニュー・お客様名つき。押すと予約の詳細へ）とブロック枠（店舗全体の分も）
 *   ・兼任先の部署の予約・ブロック枠、全体スケジュールで入れた予定（my-elsewhere.ts）
 *   ・つないでいる Google カレンダーの予定（本人の分なので件名も出す。Google で非公開にした予定は「予定あり」）
 *
 * 本人しか見ない画面なので、全体スケジュール（team-view.ts）と違い中身まで出す。
 */
import { type GoogleEventItem, fetchGoogleEventsOfDates, isGoogleCalendarConfigured } from "./google-calendar";
import { fetchMyElsewhere } from "./my-elsewhere";
import { prisma } from "./prisma";

export type MyCalendarItem = {
  key: string;
  date: string;
  kind: "event" | "reservation" | "elsewhere" | "block" | "google";
  startMinutes: number;
  endMinutes: number;
  label: string;
  note: string | null;
  href?: string;
};

export async function fetchMyCalendar(params: {
  userId: string;
  tenantId: string;
  staffId: string;
  dates: string[];
}): Promise<MyCalendarItem[]> {
  const { tenantId, staffId, dates } = params;

  const [reservations, blocks, elsewhere, googleConnection] = await Promise.all([
    prisma.reservation.findMany({
      where: { tenantId, staffId, date: { in: dates }, status: "booked" },
      select: {
        id: true,
        date: true,
        startMinutes: true,
        endMinutes: true,
        menuNameSnapshot: true,
        customer: { select: { name: true } },
      },
    }),
    // 自分のブロック枠と、店舗全体のブロック枠（1日表示と同じく、自分にも関わるので出す）
    prisma.block.findMany({
      where: { tenantId, date: { in: dates }, OR: [{ staffId }, { staffId: null }] },
      select: { id: true, date: true, startMinutes: true, endMinutes: true, reason: true, staffId: true },
    }),
    fetchMyElsewhere(params),
    isGoogleCalendarConfigured()
      ? prisma.staff
          .findUnique({ where: { id: staffId }, select: { employee: { select: { googleCalendarConnection: true } } } })
          .then((staff) => staff?.employee?.googleCalendarConnection ?? null)
      : null,
  ]);

  // 本人の分なので件名つきで取る（全体スケジュール用の控え＝本人の「件名を出す」設定に従う分とは別）
  const google = googleConnection ? await fetchGoogleEventsOfDates(googleConnection, dates, true) : null;

  return [
    ...reservations.map(
      (r): MyCalendarItem => ({
        key: `r-${r.id}`,
        date: r.date,
        kind: "reservation",
        startMinutes: r.startMinutes,
        endMinutes: r.endMinutes,
        label: r.menuNameSnapshot,
        note: `${r.customer.name} 様`,
        href: `/reservations/${r.id}`,
      }),
    ),
    ...blocks.map(
      (b): MyCalendarItem => ({
        key: `b-${b.id}`,
        date: b.date,
        kind: "block",
        startMinutes: b.startMinutes,
        endMinutes: b.endMinutes,
        label: b.reason,
        note: b.staffId === null ? "店舗全体" : null,
      }),
    ),
    ...elsewhere.map((e): MyCalendarItem => {
      if (e.kind === "elsewhere-reservation") {
        return {
          key: `er-${e.id}`,
          date: e.date,
          kind: "elsewhere",
          startMinutes: e.startMinutes,
          endMinutes: e.endMinutes,
          label: e.menuName,
          note: `${e.tenantName}・${e.customerName} 様`,
        };
      }
      if (e.kind === "elsewhere-block") {
        return {
          key: `eb-${e.id}`,
          date: e.date,
          kind: "block",
          startMinutes: e.startMinutes,
          endMinutes: e.endMinutes,
          label: e.reason,
          note: e.tenantName,
        };
      }
      return {
        key: `ev-${e.id}`,
        date: e.date,
        kind: "event",
        startMinutes: e.startMinutes,
        endMinutes: e.endMinutes,
        label: e.title,
        note: "全体スケジュールの予定",
      };
    }),
    ...[...(google ?? new Map<string, GoogleEventItem[]>())].flatMap(([date, list]) =>
      list.map(
        (g, i): MyCalendarItem => ({
          key: `g-${date}-${i}`,
          date,
          kind: "google",
          startMinutes: g.start,
          endMinutes: g.end,
          label: g.title ?? "予定あり",
          note: "Googleカレンダー",
        }),
      ),
    ),
  ];
}
