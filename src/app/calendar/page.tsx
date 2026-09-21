import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireSession } from "@/lib/auth";
import { getDaySchedule, getTenant } from "@/lib/schedule";
import {
  addDays,
  formatDateLabel,
  sanitizeDate,
  subtract,
  toHm,
  todayString,
} from "@/lib/time";

/** 1分あたりの高さ（px）。1時間 = 72px */
const PX_PER_MIN = 1.2;

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
  const totalHeight = (viewEnd - viewStart) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = viewStart; m <= viewEnd; m += 60) hours.push(m);

  const top = (minutes: number) => (minutes - viewStart) * PX_PER_MIN;
  const today = todayString();

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="予約カレンダー" session={session}>
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

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        {/* スタッフ名の行 */}
        <div className="flex border-b border-neutral-200 bg-neutral-50">
          <div className="w-14 shrink-0" />
          {columns.map((col) => (
            <div
              key={col.staffId}
              className="min-w-32 flex-1 border-l border-neutral-200 px-2 py-2 text-center text-sm font-medium"
            >
              {col.staffName}
              {col.working.length === 0 && (
                <span className="ml-1 text-xs font-normal text-neutral-400">休</span>
              )}
            </div>
          ))}
        </div>

        {/* 時間帯の本体 */}
        <div className="flex">
          {/* 時刻の目盛り */}
          <div className="relative w-14 shrink-0" style={{ height: totalHeight }}>
            {hours.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-neutral-400"
                style={{ top: top(m) }}
              >
                {toHm(m)}
              </span>
            ))}
          </div>

          {columns.map((col) => {
            // 勤務時間外（休憩・営業時間外）を灰色で示す
            const closed = subtract([{ start: viewStart, end: viewEnd }], col.working);

            return (
              <div
                key={col.staffId}
                className="relative min-w-32 flex-1 border-l border-neutral-200"
                style={{ height: totalHeight }}
              >
                {closed.map((c) => (
                  <div
                    key={`${c.start}-${c.end}`}
                    className="absolute inset-x-0 bg-neutral-100"
                    style={{ top: top(c.start), height: (c.end - c.start) * PX_PER_MIN }}
                  />
                ))}

                {hours.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-x-0 border-t border-neutral-100"
                    style={{ top: top(m) }}
                  />
                ))}

                {col.reservations.map((r) => (
                  <Link
                    key={r.id}
                    href={`/reservations/${r.id}`}
                    className="absolute inset-x-1 block overflow-hidden rounded border border-sky-300 bg-sky-100 px-1.5 py-1 text-xs leading-tight shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-200"
                    style={{
                      top: top(r.startMinutes),
                      height: (r.endMinutes - r.startMinutes) * PX_PER_MIN - 2,
                    }}
                  >
                    <div className="font-medium text-sky-900">{r.menuName}</div>
                    <div className="truncate text-sky-700">{r.customerName} 様</div>
                    <div className="tabular-nums text-sky-600">
                      {toHm(r.startMinutes)}–{toHm(r.endMinutes)}
                    </div>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        灰色は勤務時間外（昼休憩・営業時間外・休業日）。予約の枠は片付け時間を含みます。
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
