import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { DayCalendarGrid } from "@/components/day-calendar-grid";
import { requireSession } from "@/lib/auth";
import { getDaySchedule, getTenant } from "@/lib/schedule";
import { addDays, formatDateLabel, sanitizeDate, todayString } from "@/lib/time";

export default async function CalendarPage({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise
  searchParams: Promise<{ date?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const date = sanitizeDate(sp.date);

  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);
  const schedule = await getDaySchedule({ tenantId: tenant.id, date });

  const { viewStart, viewEnd, columns } = schedule;
  const today = todayString();

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="予約カレンダー" session={session}>
        <Link
          href={`/calendar/week?date=${date}`}
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
          <DateLink date={addDays(date, -1)} label="← 前日" />
          <DateLink date={today} label="今日" highlight={date === today} />
          <DateLink date={addDays(date, 1)} label="翌日 →" />
        </nav>
      </div>

      <DayCalendarGrid
        date={date}
        columns={columns}
        viewStart={viewStart}
        viewEnd={viewEnd}
        slotMinutes={tenant.slotMinutes}
        actor={{ role: session.role, staffId: session.staffId }}
      />

      <p className="mt-3 text-xs text-neutral-500">
        灰色は勤務時間外（昼休憩・営業時間外・休業日）。予約の枠は片付け時間を含みます。
        予約はドラッグして時間や担当を変えられます（お客様への通知は送られません）。
      </p>
    </main>
  );
}

function DateLink({
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
      href={`/calendar?date=${date}`}
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
