import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireSession } from "@/lib/auth";
import { getTenant, getWeekSchedule } from "@/lib/schedule";
import { addDays, dayOfWeekOf, sanitizeDate, startOfWeek, todayString } from "@/lib/time";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

export default async function CalendarWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const anchor = sanitizeDate(sp.date);
  const startDate = startOfWeek(anchor);

  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);
  const schedule = await getWeekSchedule({ tenantId: tenant.id, startDate });

  const today = todayString();
  const monthLabel = (() => {
    const [, m] = startDate.split("-");
    const [, endM] = schedule.dates[6].split("-");
    return m === endM ? `${Number(m)}月` : `${Number(m)}〜${Number(endM)}月`;
  })();

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="予約カレンダー（週表示）" session={session}>
        <Link
          href={`/calendar?date=${anchor}`}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          日表示へ
        </Link>
        <Link
          href="/customers"
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          顧客一覧
        </Link>
        <Link
          href={`/booking?date=${anchor}`}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          ＋ 予約を追加
        </Link>
        {(session.role === "owner" || session.role === "group_admin") && (
          <Link
            href="/settings/menus"
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            設定
          </Link>
        )}
      </AppHeader>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {monthLabel} {schedule.dates[0].split("-")[2]}日〜{schedule.dates[6].split("-")[2]}日
        </h2>
        <nav className="flex items-center gap-1">
          <WeekLink date={addDays(startDate, -7)} label="← 前週" />
          <WeekLink date={today} label="今週" highlight={startDate === startOfWeek(today)} />
          <WeekLink date={addDays(startDate, 7)} label="翌週 →" />
        </nav>
      </div>

      {schedule.staffRows.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          在籍中のスタッフがいません。設定 → スタッフ から登録してください。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="w-28 shrink-0 border-r border-neutral-200 px-3 py-2 text-left font-medium text-neutral-600">
                  スタッフ
                </th>
                {schedule.dates.map((date) => {
                  const isToday = date === today;
                  const [, , d] = date.split("-");
                  return (
                    <th
                      key={date}
                      className={`min-w-32 border-l border-neutral-200 px-2 py-2 text-center font-medium ${
                        isToday ? "bg-sky-50 text-sky-800" : "text-neutral-600"
                      }`}
                    >
                      <Link href={`/calendar?date=${date}`} className="hover:underline">
                        {Number(d)}日({WEEKDAY_JA[dayOfWeekOf(date)]})
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {schedule.staffRows.map((row) => (
                <tr key={row.staffId} className="border-b border-neutral-100 last:border-b-0">
                  <td className="border-r border-neutral-200 px-3 py-2 align-top font-medium">
                    {row.staffName}
                  </td>
                  {row.days.map((day) => (
                    <td
                      key={day.date}
                      className={`border-l border-neutral-200 px-2 py-2 align-top ${
                        day.isOff ? "bg-neutral-50" : ""
                      }`}
                    >
                      {day.isOff ? (
                        <span className="text-xs text-neutral-400">休</span>
                      ) : day.reservations.length === 0 ? (
                        <span className="text-xs text-neutral-300">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {day.reservations.map((r) => (
                            <li key={r.id}>
                              <Link
                                href={`/reservations/${r.id}`}
                                className="block rounded border border-sky-200 bg-sky-50 px-1.5 py-1 text-xs leading-tight text-sky-900 hover:border-sky-400 hover:bg-sky-100"
                              >
                                <span className="tabular-nums font-medium">
                                  {toHmShort(r.startMinutes)}
                                </span>
                                <span className="ml-1 truncate">{r.customerName}様</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-500">
        「休」はその日の勤務時間が無いスタッフ。日付の見出しから、その日の日表示（分単位）に移れます。
      </p>
    </main>
  );
}

function toHmShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function WeekLink({
  date,
  label,
  highlight = false,
}: {
  date: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={`/calendar/week?date=${date}`}
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
        highlight
          ? "border-sky-300 bg-sky-50 text-sky-800"
          : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </Link>
  );
}
