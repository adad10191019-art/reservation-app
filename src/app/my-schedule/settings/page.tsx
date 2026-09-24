import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { requireSession } from "@/lib/auth";
import { formatRanges } from "@/lib/ranges";
import { getTenant } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { issueCalendarToken, saveOwnDayOverride } from "@/lib/staff-schedule-actions";
import { dayOfWeekOf, formatDateLabel, sanitizeDate, toHm } from "@/lib/time";

export default async function MyScheduleSettingsPage({
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
        <AppHeader tenantName={tenant.name} subtitle="予定の設定" session={session} />
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-4 text-sm text-amber-900">
          このアカウントはスタッフに紐づいていないため、この画面は使えません。
        </p>
      </main>
    );
  }

  const staffId = session.staffId;

  const [businessHours, ownOverrides, staffRecord] = await Promise.all([
    prisma.businessHour.findMany({
      where: {
        tenantId: tenant.id,
        dayOfWeek: dayOfWeekOf(date),
        OR: [{ staffId: null }, { staffId }],
      },
    }),
    prisma.dateOverride.findMany({ where: { tenantId: tenant.id, date, staffId } }),
    prisma.staff.findUnique({ where: { id: staffId }, select: { calendarToken: true } }),
  ]);

  const calendarFeedUrl = staffRecord?.calendarToken
    ? `${process.env.APP_URL ?? "http://localhost:3000"}/api/staff-calendar/${staffRecord.calendarToken}`
    : null;

  const weekly = formatRanges(
    (businessHours.some((h) => h.staffId === staffId)
      ? businessHours.filter((h) => h.staffId === staffId)
      : businessHours.filter((h) => h.staffId === null)
    ).map((h) => ({ start: h.startMinutes, end: h.endMinutes })),
  );

  const firstRange = ownOverrides.find((o) => o.startMinutes !== null && o.endMinutes !== null);
  const currentOverride = {
    isClosed: ownOverrides.some((o) => o.isClosed),
    start: firstRange ? toHm(firstRange.startMinutes as number) : "",
    end: firstRange ? toHm(firstRange.endMinutes as number) : "",
  };

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="予定の設定" session={session}>
        <Link
          href={`/my-schedule?date=${date}`}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          自分の予定へ戻る
        </Link>
      </AppHeader>

      <Banner error={sp.error} done={sp.done} />

      <p className="mb-4 text-xs leading-relaxed text-neutral-500">
        {formatDateLabel(date)} の設定です。日を変えたいときは、まず
        <Link href="/my-schedule" className="mx-1 underline">
          自分の予定
        </Link>
        で日付を選んでから、ここに戻ってきてください。
      </p>

      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-1 font-semibold">この日だけの勤務時間</h3>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          入り・出の時刻だけ入れてください。いつもの曜日パターン（{weekly || "休み"}）より
          <strong>優先</strong>されます。両方空欄に戻せば、いつものパターンに戻ります。
          <br />
          <strong>昼休憩など、勤務の途中で空けたい時間は、自分の予定の画面に入れてください。</strong>
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

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-1 font-semibold">Googleカレンダーと同期</h3>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          自分の予約・自分の予定（ブロック枠）を、Googleカレンダーで確認できるようにします。
          発行したURLをGoogleカレンダーの「他のカレンダー」→「URLから追加」に貼り付けてください。
          <br />
          更新はGoogle側の巡回タイミング次第で、数時間ほど反映が遅れることがあります。
        </p>

        {calendarFeedUrl ? (
          <div className="space-y-3">
            <input
              type="text"
              readOnly
              value={calendarFeedUrl}
              className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700"
            />
            <form action={issueCalendarToken}>
              <input type="hidden" name="date" value={date} />
              <button
                type="submit"
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50"
              >
                URLを再発行する（今のURLは使えなくなります）
              </button>
            </form>
          </div>
        ) : (
          <form action={issueCalendarToken}>
            <input type="hidden" name="date" value={date} />
            <button
              type="submit"
              className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              同期用URLを発行する
            </button>
          </form>
        )}

        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          このURLを知っている人は誰でも中身（予約・予定）を見られます。他人に教えないでください。
          誤って共有してしまった場合は「再発行」で無効化できます。
        </p>
      </section>
    </main>
  );
}
