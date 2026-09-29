import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { WeekCalendarGrid } from "@/components/week-calendar-grid";
import { requireSession } from "@/lib/auth";
import { getTenant, getWeekSchedule } from "@/lib/schedule";
import { addDays, sanitizeDate, startOfWeek, todayString } from "@/lib/time";

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
        <WeekCalendarGrid
          dates={schedule.dates}
          staffRows={schedule.staffRows}
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
