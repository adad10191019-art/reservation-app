import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { requireSession } from "@/lib/auth";
import { formatRanges } from "@/lib/ranges";
import { getTenant } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { createOwnBlock, deleteOwnBlock, saveOwnDayOverride } from "@/lib/staff-schedule-actions";
import { addDays, dayOfWeekOf, formatDateLabel, sanitizeDate, toHm, todayString } from "@/lib/time";

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

  const [businessHours, ownOverrides, ownBlocks, shopBlocks] = await Promise.all([
    prisma.businessHour.findMany({
      where: {
        tenantId: tenant.id,
        dayOfWeek: dayOfWeekOf(date),
        OR: [{ staffId: null }, { staffId }],
      },
    }),
    prisma.dateOverride.findMany({ where: { tenantId: tenant.id, date, staffId } }),
    prisma.block.findMany({
      where: { tenantId: tenant.id, date, staffId },
      orderBy: { startMinutes: "asc" },
    }),
    prisma.block.findMany({
      where: { tenantId: tenant.id, date, staffId: null },
      orderBy: { startMinutes: "asc" },
    }),
  ]);

  const weekly = formatRanges(
    (businessHours.some((h) => h.staffId === staffId)
      ? businessHours.filter((h) => h.staffId === staffId)
      : businessHours.filter((h) => h.staffId === null)
    ).map((h) => ({ start: h.startMinutes, end: h.endMinutes })),
  );

  // 「入り・出」は1本だけを想定している（途中の空きは下の自分の予定で表す）。
  // 複数区間が入っていた場合は、最初の1本だけを入り・出欄に出す
  const firstRange = ownOverrides.find((o) => o.startMinutes !== null && o.endMinutes !== null);
  const currentOverride = {
    isClosed: ownOverrides.some((o) => o.isClosed),
    start: firstRange ? toHm(firstRange.startMinutes as number) : "",
    end: firstRange ? toHm(firstRange.endMinutes as number) : "",
  };

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="自分の予定" session={session}>
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

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{formatDateLabel(date)}</h2>
        <nav className="flex items-center gap-1">
          <DayLink date={addDays(date, -1)} label="← 前日" />
          <DayLink date={todayString()} label="今日" />
          <DayLink date={addDays(date, 1)} label="翌日 →" />
        </nav>
      </div>

      <p className="mb-5 text-xs leading-relaxed text-neutral-500">
        ここにある内容は<strong>自分（{session.name}）の分だけ</strong>です。
        他のスタッフの予定は見えません・触れません。
      </p>

      {/* この日だけの勤務時間 */}
      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-1 font-semibold">この日だけの勤務時間</h3>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          入り・出の時刻だけ入れてください。いつもの曜日パターン（{weekly || "休み"}）より
          <strong>優先</strong>されます。両方空欄に戻せば、いつものパターンに戻ります。
          <br />
          <strong>昼休憩など、勤務の途中で空けたい時間は、下の「自分の予定」に入れてください。</strong>
        </p>

        <form action={saveOwnDayOverride} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="date" value={date} />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="closed" defaultChecked={currentOverride.isClosed} className="size-4" />
            この日は休む
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">入り</span>
            <input
              type="time"
              name="start"
              step={300}
              defaultValue={currentOverride.start}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">出</span>
            <input
              type="time"
              name="end"
              step={300}
              defaultValue={currentOverride.end}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            保存する
          </button>
        </form>
      </section>

      {/* 自分の予定（ブロック枠） */}
      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-1 font-semibold">自分の予定（商談・私用などで時間を塞ぐ）</h3>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          予約ではないが、この時間は空けたくないときに使います。
          ここに入れておけば、お客様や他のスタッフからは「空いていない時間」として扱われます。
        </p>

        <form action={createOwnBlock} className="mb-4 grid gap-3 sm:grid-cols-12">
          <input type="hidden" name="date" value={date} />
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-xs font-medium text-neutral-600">開始</span>
            <input
              type="time"
              name="start"
              required
              step={300}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-xs font-medium text-neutral-600">終了</span>
            <input
              type="time"
              name="end"
              required
              step={300}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block sm:col-span-4">
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

      {shopBlocks.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <h3 className="mb-2 font-medium text-neutral-700">
            店舗全体の予定（参考。ここからは変更できません）
          </h3>
          <ul className="space-y-1 text-neutral-600">
            {shopBlocks.map((block) => (
              <li key={block.id}>
                <span className="tabular-nums">
                  {toHm(block.startMinutes)}–{toHm(block.endMinutes)}
                </span>{" "}
                {block.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
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
