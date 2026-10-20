import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CalendarScopeToggle } from "@/components/calendar-scope-toggle";
import { DayCalendarGrid } from "@/components/day-calendar-grid";
import { requireSession } from "@/lib/auth";
import { type CalendarScope, parseCalendarScope, pickVisibleStaff, scopeQuery } from "@/lib/calendar-scope";
import { getDaySchedule, getTenant } from "@/lib/schedule";
import { addDays, formatDateLabel, sanitizeDate, todayString } from "@/lib/time";

export default async function CalendarPage({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise
  searchParams: Promise<{ date?: string; error?: string; all?: string }>;
}) {
  const sp = await searchParams;
  const date = sanitizeDate(sp.date);
  const scope = parseCalendarScope(sp.all);

  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);
  const schedule = await getDaySchedule({ tenantId: tenant.id, date });

  const { viewStart, viewEnd } = schedule;
  const { visible: columns, showingMineOnly, hasOwnColumn } = pickVisibleStaff(
    schedule.columns.map((c) => ({ ...c, hasReservations: c.reservations.length > 0 })),
    session.staffId,
    scope,
  );
  const today = todayString();

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="予約カレンダー" session={session}>
        <Link
          href={`/calendar/week?date=${date}${scopeQuery(scope)}`}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          週表示へ
        </Link>
        <Link
          href={`/booking?date=${date}`}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          ＋ 予約を追加
        </Link>
      </AppHeader>

      {sp.error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {sp.error}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{formatDateLabel(date)}</h2>
        <nav className="flex items-center gap-1">
          <DateLink date={addDays(date, -1)} scope={scope} label="← 前日" />
          <DateLink date={today} scope={scope} label="今日" highlight={date === today} />
          <DateLink date={addDays(date, 1)} scope={scope} label="翌日 →" />
        </nav>
      </div>

      {hasOwnColumn && (
        <CalendarScopeToggle
          showingMineOnly={showingMineOnly}
          mineHref={`/calendar?date=${date}`}
          allHref={`/calendar?date=${date}&all=1`}
        />
      )}

      {columns.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          予約を受けるメンバーがいません。設定 → メンバー で登録し、対応メニューを選んでください。
        </p>
      ) : (
        <DayCalendarGrid
          date={date}
          columns={columns}
          viewStart={viewStart}
          viewEnd={viewEnd}
          slotMinutes={tenant.slotMinutes}
          actor={{ role: session.role, staffId: session.staffId }}
        />
      )}

      <p className="mt-3 text-xs text-neutral-500">
        灰色は勤務時間外（昼休憩・営業時間外・休業日）。予約の枠は片付け時間を含みます。
        予約はドラッグして時間や担当を変えられます（お客様への通知は送られません）。
      </p>
    </main>
  );
}

function DateLink({
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
      href={`/calendar?date=${date}${scopeQuery(scope)}`}
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
