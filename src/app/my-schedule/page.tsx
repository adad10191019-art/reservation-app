import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDaySchedule, getTenant } from "@/lib/schedule";
import { createOwnBlock, deleteOwnBlock } from "@/lib/staff-schedule-actions";
import { addDays, formatDateLabel, sanitizeDate, toHm, todayString } from "@/lib/time";

type AgendaItem =
  | { kind: "reservation"; id: string; startMinutes: number; endMinutes: number; menuName: string; customerName: string }
  | { kind: "block"; id: string; startMinutes: number; endMinutes: number; reason: string; wholeShop: boolean };

export default async function MySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const date = sanitizeDate(sp.date);
  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);

  if (!session.staffId) {
    return (
      <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
        <AppHeader tenantName={tenant.name} subtitle="自分の予定" session={session}>
          <Link
            href="/calendar"
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            カレンダーへ
          </Link>
        </AppHeader>
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-4 text-sm text-amber-900">
          このアカウントはスタッフに紐づいていないため、この画面は使えません。
        </p>
      </main>
    );
  }

  const staffId = session.staffId;

  const [schedule, ownBlocks] = await Promise.all([
    getDaySchedule({ tenantId: tenant.id, date }),
    prisma.block.findMany({
      where: { tenantId: tenant.id, date, staffId },
      orderBy: { startMinutes: "asc" },
    }),
  ]);

  // 自分の列だけを取り出す。まだ勤務日として登録されていない
  // （どのメニューにも対応していない等）場合は列自体が無いこともある
  const myColumn = schedule.columns.find((c) => c.staffId === staffId) ?? null;

  // 予約と自分の予定（ブロック枠）を、時刻順の1本のリストにまとめる
  const agenda: AgendaItem[] = myColumn
    ? [
        ...myColumn.reservations.map(
          (r): AgendaItem => ({
            kind: "reservation",
            id: r.id,
            startMinutes: r.startMinutes,
            endMinutes: r.endMinutes,
            menuName: r.menuName,
            customerName: r.customerName,
          }),
        ),
        ...myColumn.blocks.map(
          (b): AgendaItem => ({
            kind: "block",
            id: b.id,
            startMinutes: b.startMinutes,
            endMinutes: b.endMinutes,
            reason: b.reason,
            wholeShop: b.wholeShop,
          }),
        ),
      ].sort((a, b) => a.startMinutes - b.startMinutes)
    : [];

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <AppHeader
        tenantName={tenant.name}
        subtitle="自分の予定"
        session={session}
        menuLinks={[{ href: `/my-schedule/settings?date=${date}`, label: "予定の設定" }]}
      >
        <Link
          href={`/calendar?date=${date}`}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          全体を見る（日表示）
        </Link>
        <Link
          href={`/calendar/week?date=${date}`}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          全体を見る（週表示）
        </Link>
      </AppHeader>

      <Banner error={sp.error} done={sp.done} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{formatDateLabel(date)}</h2>
        <nav className="flex items-center gap-1">
          <DayLink date={addDays(date, -1)} label="← 前日" />
          <DayLink date={todayString()} label="今日" />
          <DayLink date={addDays(date, 1)} label="翌日 →" />
        </nav>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-neutral-500">
        ここにある内容は<strong>自分（{session.name}）の分だけ</strong>です。
        他のスタッフの予定は見えません・触れません。
      </p>

      {/* 今日の予定（時刻順のカードリスト） */}
      <section className="mb-5">
        {!myColumn ? (
          <p className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            この日は対応できるメニューが無いため、予定を表示できません。
          </p>
        ) : agenda.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            この日の予定はありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {agenda.map((item) =>
              item.kind === "reservation" ? (
                <li key={`r-${item.id}`}>
                  <Link
                    href={`/reservations/${item.id}`}
                    className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 transition-colors hover:border-sky-300 hover:bg-sky-100"
                  >
                    <span className="w-11 shrink-0 text-sm font-medium tabular-nums text-sky-800">
                      {toHm(item.startMinutes)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-sky-900">
                        {item.menuName}
                      </span>
                      <span className="block truncate text-xs text-sky-700">
                        {item.customerName} 様・{item.endMinutes - item.startMinutes}分
                      </span>
                    </span>
                  </Link>
                </li>
              ) : (
                <li
                  key={`b-${item.id}`}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5"
                >
                  <span className="w-11 shrink-0 text-sm font-medium tabular-nums text-amber-800">
                    {toHm(item.startMinutes)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-amber-900">
                      {item.reason}
                      {item.wholeShop && (
                        <span className="ml-1 font-normal text-amber-700">（店舗全体）</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-amber-700">
                      {item.endMinutes - item.startMinutes}分
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {/* 自分の予定（ブロック枠） */}
      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <h3 className="font-semibold">自分の予定を追加</h3>
          <details className="group relative">
            <summary className="flex size-4 cursor-pointer list-none items-center justify-center rounded-full bg-neutral-200 text-[10px] text-neutral-600 marker:content-none hover:bg-neutral-300">
              ?
            </summary>
            <p className="absolute left-0 top-6 z-10 w-64 rounded-md border border-neutral-200 bg-white p-2.5 text-xs leading-relaxed text-neutral-600 shadow-lg">
              商談・私用など、予約ではないが時間を空けたくないときに使います。お客様や他のスタッフからは「空いていない時間」として扱われます。
            </p>
          </details>
        </div>

        <form action={createOwnBlock} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="date"
            name="date"
            required
            defaultValue={date}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <input
            type="time"
            name="start"
            required
            step={300}
            className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <span className="text-sm text-neutral-400">〜</span>
          <input
            type="time"
            name="end"
            required
            step={300}
            className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            name="reason"
            required
            placeholder="商談、私用 など"
            className="min-w-32 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            追加
          </button>
        </form>

        {ownBlocks.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-5 text-center text-sm text-neutral-500">
            この日の自分の予定はありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {ownBlocks.map((block) => (
              <li
                key={block.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm"
              >
                <span className="text-amber-900">
                  <span className="tabular-nums">
                    {toHm(block.startMinutes)}–{toHm(block.endMinutes)}
                  </span>
                  <span className="mx-2 font-medium">{block.reason}</span>
                </span>
                <form action={deleteOwnBlock}>
                  <input type="hidden" name="id" value={block.id} />
                  <input type="hidden" name="date" value={date} />
                  <button
                    type="submit"
                    className="rounded-md border border-amber-400 px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100"
                  >
                    削除
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function DayLink({ date, label }: { date: string; label: string }) {
  return (
    <Link
      href={`/my-schedule?date=${date}`}
      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
    >
      {label}
    </Link>
  );
}
