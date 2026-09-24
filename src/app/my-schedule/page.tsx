import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDaySchedule, getTenant } from "@/lib/schedule";
import { createOwnBlock, deleteOwnBlock } from "@/lib/staff-schedule-actions";
import { addDays, formatDateLabel, sanitizeDate, subtract, toHm, todayString } from "@/lib/time";

/** 1分あたりの高さ（px）。/calendar の日表示と揃えている */
const PX_PER_MIN = 1.4;

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

  const { viewStart, viewEnd } = schedule;
  // 時刻の目盛りは行の中央揃えなので、一番上と一番下の分は上下に
  // はみ出す。その逃げ場として、時間軸の上下にパディング（LABEL_PAD）を
  // 足しておく。目盛り・グレー帯・予約すべて同じ top() を通すので、
  // ずれずに一律で下へシフトするだけになる。
  const LABEL_PAD = 12;
  const totalHeight = (viewEnd - viewStart) * PX_PER_MIN + LABEL_PAD * 2;
  const hours: number[] = [];
  for (let m = viewStart; m <= viewEnd; m += 60) hours.push(m);
  const top = (minutes: number) => (minutes - viewStart) * PX_PER_MIN + LABEL_PAD;
  const closed = myColumn ? subtract([{ start: viewStart, end: viewEnd }], myColumn.working) : [];

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

      {/* 今日のスケジュール（自分の列だけのタイムライン） */}
      <section className="mb-5 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {!myColumn ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            この日は対応できるメニューが無いため、予定を表示できません。
          </p>
        ) : (
          <div className="flex">
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

            <div className="relative min-w-64 flex-1 border-l border-neutral-200" style={{ height: totalHeight }}>
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

              {myColumn.blocks.map((b) => (
                <div
                  key={b.id}
                  className="absolute inset-x-1 overflow-hidden rounded border border-dashed border-amber-400 bg-amber-50 px-1.5 py-1 text-xs leading-tight text-amber-900"
                  style={{
                    top: top(b.startMinutes),
                    height: (b.endMinutes - b.startMinutes) * PX_PER_MIN - 2,
                  }}
                >
                  <div className="truncate font-medium">
                    {b.reason}
                    {b.wholeShop && <span className="ml-1 font-normal text-amber-700">（店舗全体）</span>}
                  </div>
                  <div className="tabular-nums text-amber-700">
                    {toHm(b.startMinutes)}–{toHm(b.endMinutes)}
                  </div>
                </div>
              ))}

              {myColumn.reservations.map((r) => (
                <Link
                  key={r.id}
                  href={`/reservations/${r.id}`}
                  title={`${toHm(r.startMinutes)}–${toHm(r.endMinutes)} ${r.menuName} ${r.customerName}様`}
                  className="absolute inset-x-1 block overflow-hidden rounded border border-sky-300 bg-sky-100 px-1.5 py-1 text-xs leading-none shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-200"
                  style={{
                    top: top(r.startMinutes),
                    height: (r.endMinutes - r.startMinutes) * PX_PER_MIN - 2,
                  }}
                >
                  <div className="truncate font-medium text-sky-900">{r.menuName}</div>
                  <div className="mt-0.5 tabular-nums text-sky-800">
                    {toHm(r.startMinutes)}–{toHm(r.endMinutes)}
                  </div>
                  <div className="mt-0.5 truncate text-sky-700">{r.customerName} 様</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 自分の予定（ブロック枠） */}
      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-1 font-semibold">自分の予定（商談・私用などで時間を塞ぐ）</h3>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          予約ではないが、この時間は空けたくないときに使います。上のスケジュールにも
          点線で表示されます。お客様や他のスタッフからは「空いていない時間」として扱われます。
        </p>

        <form action={createOwnBlock} className="mb-4 grid gap-3 sm:grid-cols-12">
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-xs font-medium text-neutral-600">日付</span>
            <input
              type="date"
              name="date"
              required
              defaultValue={date}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">開始</span>
            <input
              type="time"
              name="start"
              required
              step={300}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">終了</span>
            <input
              type="time"
              name="end"
              required
              step={300}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-xs font-medium text-neutral-600">内容</span>
            <input
              type="text"
              name="reason"
              required
              placeholder="商談、面談、私用 など"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-end sm:col-span-2">
            <button
              type="submit"
              className="w-full rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              追加
            </button>
          </div>
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
