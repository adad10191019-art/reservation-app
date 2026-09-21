import Link from "next/link";
import { Banner } from "@/components/banner";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatRanges } from "@/lib/ranges";
import { createBlock, deleteBlock, saveDateOverrides } from "@/lib/settings-actions";
import { getTenant } from "@/lib/schedule";
import {
  addDays,
  dayOfWeekOf,
  formatDateLabel,
  sanitizeDate,
  toHm,
  todayString,
} from "@/lib/time";

export default async function DaySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const date = sanitizeDate(sp.date);
  const session = await requireOwner();
  const tenant = await getTenant(session.tenantId);

  const [staffs, overrides, blocks, businessHours] = await Promise.all([
    prisma.staff.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
    prisma.dateOverride.findMany({ where: { tenantId: tenant.id, date } }),
    prisma.block.findMany({
      where: { tenantId: tenant.id, date },
      orderBy: { startMinutes: "asc" },
    }),
    prisma.businessHour.findMany({
      where: { tenantId: tenant.id, dayOfWeek: dayOfWeekOf(date) },
    }),
  ]);

  const staffNames = new Map(staffs.map((s) => [s.id, s.name]));

  /** その対象の、この日の例外を「休み」と「時間帯」に分けて返す */
  function overrideOf(staffId: string | null) {
    const rows = overrides.filter((o) => o.staffId === staffId);
    return {
      isClosed: rows.some((o) => o.isClosed),
      ranges: formatRanges(
        rows
          .filter((o) => o.startMinutes !== null && o.endMinutes !== null)
          .map((o) => ({ start: o.startMinutes as number, end: o.endMinutes as number })),
      ),
      exists: rows.length > 0,
    };
  }

  /** 例外がないときに使われる、曜日ごとの基本パターン */
  function weeklyOf(staffId: string | null) {
    const own = businessHours.filter((h) => h.staffId === staffId);
    const source = staffId !== null && own.length === 0
      ? businessHours.filter((h) => h.staffId === null)
      : own;
    return formatRanges(source.map((h) => ({ start: h.startMinutes, end: h.endMinutes })));
  }

  const targets = [
    { key: "shop", staffId: null as string | null, label: "店舗全体" },
    ...staffs.map((s) => ({ key: s.id, staffId: s.id as string | null, label: s.name })),
  ];

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{formatDateLabel(date)}</h2>
        <nav className="flex items-center gap-1">
          <DayLink date={addDays(date, -1)} label="← 前日" />
          <DayLink date={todayString()} label="今日" />
          <DayLink date={addDays(date, 1)} label="翌日 →" />
          <Link
            href={`/calendar?date=${date}`}
            className="ml-2 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            カレンダーで見る
          </Link>
        </nav>
      </div>

      <form method="get" className="flex items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">日付</span>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          この日を開く
        </button>
      </form>

      {/* この日だけの勤務時間 */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-1 font-semibold">この日だけの勤務時間</h3>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          入力すると、曜日ごとの基本パターンより<strong>優先</strong>されます。
          空欄のままなら基本パターンが使われます（かっこ内が基本パターン）。
          <br />
          <code>10:00-12:00, 16:00-19:00</code> のように書けば、分割シフトにもできます。
        </p>

        <form action={saveDateOverrides} className="space-y-3">
          <input type="hidden" name="date" value={date} />

          {targets.map((target) => {
            const current = overrideOf(target.staffId);
            const weekly = weeklyOf(target.staffId);
            return (
              <div key={target.key} className="flex flex-wrap items-center gap-3">
                <span className="w-20 shrink-0 text-sm font-medium">{target.label}</span>

                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name={`closed_${target.key}`}
                    defaultChecked={current.isClosed}
                    className="size-4"
                  />
                  休み
                </label>

                <input
                  type="text"
                  name={`ranges_${target.key}`}
                  defaultValue={current.ranges}
                  placeholder={weekly ? `基本: ${weekly}` : "基本: 休み"}
                  className="min-w-56 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-sm"
                />
              </div>
            );
          })}

          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            保存する
          </button>
        </form>
      </section>

      {/* ブロック枠 */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-1 font-semibold">ブロック枠（予約以外で時間を塞ぐ）</h3>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          会議・清掃・研修など、予約ではないが枠を埋めたい予定です。
          ダミーの予約で代用すると売上集計に混ざるため、こちらを使ってください。
          <br />
          担当を選ばなければ、<strong>全スタッフ</strong>の同じ時間が塞がります。
        </p>

        <form action={createBlock} className="mb-4 grid gap-3 sm:grid-cols-12">
          <input type="hidden" name="date" value={date} />

          <label className="block sm:col-span-3">
            <span className="mb-1 block text-xs font-medium text-neutral-600">担当</span>
            <select
              name="staffId"
              defaultValue=""
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">全スタッフ</option>
              {staffs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
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
            <span className="mb-1 block text-xs font-medium text-neutral-600">理由</span>
            <input
              type="text"
              name="reason"
              required
              placeholder="会議"
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

        {blocks.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-5 text-center text-sm text-neutral-500">
            この日のブロック枠はありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {blocks.map((block) => (
              <li
                key={block.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm"
              >
                <span className="text-amber-900">
                  <span className="tabular-nums">
                    {toHm(block.startMinutes)}–{toHm(block.endMinutes)}
                  </span>
                  <span className="mx-2 font-medium">{block.reason}</span>
                  <span className="text-amber-700">
                    {block.staffId ? staffNames.get(block.staffId) : "全スタッフ"}
                  </span>
                </span>
                <form action={deleteBlock}>
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
    </div>
  );
}

function DayLink({ date, label }: { date: string; label: string }) {
  return (
    <Link
      href={`/settings/days?date=${date}`}
      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
    >
      {label}
    </Link>
  );
}
