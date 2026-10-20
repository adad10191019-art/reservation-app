import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CalendarScopeToggle } from "@/components/calendar-scope-toggle";
import { WeekCalendarGrid } from "@/components/week-calendar-grid";
import { requireSession } from "@/lib/auth";
import { type CalendarScope, parseCalendarScope, pickVisibleStaff, scopeQuery } from "@/lib/calendar-scope";
import { getTenant, getWeekSchedule } from "@/lib/schedule";
import { addDays, sanitizeDate, startOfWeek, todayString } from "@/lib/time";

export default async function CalendarWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; all?: string }>;
}) {
  const sp = await searchParams;
  const anchor = sanitizeDate(sp.date);
  const startDate = startOfWeek(anchor);
  const scope = parseCalendarScope(sp.all);

  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);
  const schedule = await getWeekSchedule({ tenantId: tenant.id, startDate });
  const { visible: staffRows, showingMineOnly, hasOwnColumn } = pickVisibleStaff(
    schedule.staffRows.map((row) => ({
      ...row,
      hasReservations: row.days.some((d) => d.reservations.length > 0),
    })),
    session.staffId,
    scope,
  );

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
          href={`/calendar?date=${anchor}${scopeQuery(scope)}`}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          日表示へ
        </Link>
        <Link
          href={`/booking?date=${anchor}`}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          ＋ 予約を追加
        </Link>
      </AppHeader>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {monthLabel} {schedule.dates[0].split("-")[2]}日〜{schedule.dates[6].split("-")[2]}日
        </h2>
        <nav className="flex items-center gap-1">
          <WeekLink date={addDays(startDate, -7)} scope={scope} label="← 前週" />
          <WeekLink date={today} scope={scope} label="今週" highlight={startDate === startOfWeek(today)} />
          <WeekLink date={addDays(startDate, 7)} scope={scope} label="翌週 →" />
        </nav>
      </div>

      {hasOwnColumn && (
        <CalendarScopeToggle
          showingMineOnly={showingMineOnly}
          mineHref={`/calendar/week?date=${anchor}`}
          allHref={`/calendar/week?date=${anchor}&all=1`}
        />
      )}

      {staffRows.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          予約を受けるメンバーがいません。設定 → メンバー で登録し、対応メニューを選んでください。
        </p>
      ) : (
        <WeekCalendarGrid
          dates={schedule.dates}
          staffRows={staffRows}
          dayQuery={scopeQuery(scope)}
          today={today}
          actor={{ role: session.role, staffId: session.staffId }}
        />
      )}

      <p className="mt-3 text-xs text-neutral-500">
        「休」はその日の勤務時間が無いスタッフ。日付の見出しから、その日の日表示（分単位）に移れます。
        予約はドラッグして別の日・別の担当に動かせます（時刻は変わりません。お客様への通知は送られません）。
      </p>
    </main>
  );
}

function WeekLink({
  date,
  scope,
  label,
  highlight = false,
}: {
  date: string;
  scope: CalendarScope;
  label: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={`/calendar/week?date=${date}${scopeQuery(scope)}`}
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
