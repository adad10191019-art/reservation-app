import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { Banner } from "@/components/banner";
import {
  AddEntryPanel,
  DayColumnHeader,
  MonthGrid,
  ScheduleNav,
  type ScheduleEntry,
  TimelineGrid,
  scheduleHref,
} from "@/components/schedule-views";
import { SubmitButton } from "@/components/submit-button";
import { TimeRangeFields } from "@/components/time-range-fields";
import { requireTeamSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/schedule";
import { monthWeeks, parseView, viewDates } from "@/lib/schedule-range";
import { getTeamDays, getTeamViewer } from "@/lib/team";
import { createEmployeeEvent, deleteEmployeeEvent } from "@/lib/team-actions";
import type { TeamColumn, TeamItem } from "@/lib/team-view";
import { sanitizeDate, toHm, todayString } from "@/lib/time";
import { defaultStart } from "@/lib/time-choices";

const PATH = "/team";

/**
 * 社員の予定を見る画面。
 *   ・1日 … 社員全員を1人1列で並べる
 *   ・週・月 … 1人分だけ（上の欄で人を選ぶ。最初は自分）。数十人を週・月で並べるとスマホで読めないため
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; person?: string; error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const date = sanitizeDate(sp.date);
  const view = parseView(sp.view);
  const today = todayString();

  const session = await requireTeamSession();
  // 社員（部署に属さない人）には部署が無いので、見出しは「全社」にする
  const [tenant, viewer, employees] = await Promise.all([
    session.tenantId ? getTenant(session.tenantId) : { name: "全社" },
    getTeamViewer(session),
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  // 週・月で見る人。指定が無い・いない人なら自分、自分が名簿にいなければ名簿の先頭
  const person =
    view === "day"
      ? null
      : (employees.find((e) => e.id === sp.person)?.id ?? viewer.employeeId ?? employees[0]?.id ?? null);
  const extra: Record<string, string> = person ? { person } : {};
  const returnTo = scheduleHref(PATH, view, date, extra);

  const dates = viewDates(view, date);
  const byDate =
    view === "day" || person
      ? await getTeamDays(dates, viewer, person ?? undefined)
      : new Map<string, TeamColumn[]>();

  /** 全体スケジュールの1件を、並べる部品の形にする（消せる予定には × を付ける） */
  const toEntry = (item: TeamItem, itemDate: string): ScheduleEntry => ({
    ...item,
    action: item.deletableEventId ? (
      <form action={deleteEmployeeEvent}>
        <input type="hidden" name="id" value={item.deletableEventId} />
        <input type="hidden" name="date" value={itemDate} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <SubmitButton
          pendingText="…"
          ariaLabel={`${item.label} を削除`}
          confirmText={`「${item.label}」（${toHm(item.startMinutes)}–${toHm(item.endMinutes)}）を消しますか？`}
          className="rounded px-0.5 text-neutral-500 hover:bg-white hover:text-red-700"
        >
          ×
        </SubmitButton>
      </form>
    ) : undefined,
  });
  /** 週・月で見ている人の、その日の予定 */
  const personEntries = (d: string): ScheduleEntry[] =>
    (byDate.get(d)?.[0]?.items ?? []).map((item) => toEntry(item, d));

  const canAdd = viewer.employeeId !== null || viewer.isAdmin;
  const personName = employees.find((e) => e.id === person)?.name;

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="全体スケジュール" session={session}>
        {session.role !== "member" && (
          <Link
            href={`/calendar?date=${date}`}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            カレンダーへ
          </Link>
        )}
      </AppHeader>

      <Banner error={sp.error} done={sp.done} />

      <ScheduleNav basePath={PATH} view={view} date={date} today={today} extra={extra}>
        {view !== "day" && employees.length > 0 && (
          // 週・月で見る人を選ぶ。選んだらすぐ切り替わる
          <form method="get" action={PATH} className="flex items-center gap-1.5">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="date" value={date} />
            <span className="text-sm text-neutral-600">見る人</span>
            <AutoSubmitSelect
              key={person ?? ""}
              name="person"
              defaultValue={person ?? undefined}
              aria-label="予定を見る人"
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id === viewer.employeeId ? `${e.name}（自分）` : e.name}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        )}
      </ScheduleNav>

      {canAdd ? (
        <AddEntryPanel>
          <form action={createEmployeeEvent} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            {viewer.isAdmin && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">誰の予定</span>
                <select
                  key={person ?? ""}
                  name="employeeId"
                  // 週・月で人を選んでいれば、その人の予定を入れる形にしておく
                  defaultValue={person ?? viewer.employeeId ?? ""}
                  required
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                >
                  {viewer.employeeId === null && person === null && <option value="">選んでください</option>}
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id === viewer.employeeId ? `${e.name}（自分）` : e.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">日付</span>
              <input
                key={`date-${date}`}
                type="date"
                name="date"
                required
                defaultValue={date}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            <TimeRangeFields key={date} defaultStart={defaultStart(date, new Date())} />
            <label className="block min-w-40 flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-600">件名</span>
              <input
                type="text"
                name="title"
                required
                maxLength={100}
                placeholder="例：外出（〇〇社）"
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-2 text-sm text-neutral-700">
              <input type="checkbox" name="isPrivate" />
              私用（件名を隠す）
            </label>
            <SubmitButton
              pendingText="追加中…"
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              予定を追加
            </SubmitButton>
            {!viewer.isAdmin && person !== null && person !== viewer.employeeId && (
              // ほかの人の週・月を見ていても、入るのは自分の予定
              <p className="w-full text-xs text-neutral-500">ここで追加する予定は、自分の予定として入ります。</p>
            )}
          </form>
        </AddEntryPanel>
      ) : (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          このアカウントはメンバーとして整っていないため、予定を入れられません（見ることはできます）。
          オーナーか全社管理者に「設定 → メンバー」で整えてもらってください。
        </p>
      )}

      {employees.length === 0 ? (
        <p className="rounded-md border border-neutral-200 bg-white px-3 py-6 text-center text-sm text-neutral-500">
          メンバーがまだいません。
          {viewer.isAdmin && (
            <>
              {" "}
              <Link href="/settings/members" className="text-sky-700 underline">
                設定 → メンバー
              </Link>
              から登録してください。
            </>
          )}
        </p>
      ) : view === "day" ? (
        <TimelineGrid
          columnClassName="w-[132px] shrink-0"
          columns={(byDate.get(date) ?? []).map((col) => ({
            key: col.employeeId,
            highlight: col.isMe,
            header: (
              <>
                <div className="truncate text-sm font-medium" title={col.name}>
                  {col.name}
                  {col.isMe && <span className="ml-1 text-xs text-emerald-700">（自分）</span>}
                </div>
                <div className="truncate text-[11px] text-neutral-500" title={col.departments.join("・")}>
                  {col.departments.length > 0 ? col.departments.join("・") : "　"}
                </div>
              </>
            ),
            entries: col.items.map((item) => toEntry(item, date)),
          }))}
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-neutral-600">
            <span className="font-medium text-neutral-900">{personName}</span> さんの予定
            {view === "month" && "（日付を押すと、その日の全員の予定が出ます）"}
          </p>
          {view === "week" ? (
            <TimelineGrid
              columnClassName="min-w-[88px] flex-1"
              columns={dates.map((d) => ({
                key: d,
                highlight: d === today,
                header: <DayColumnHeader date={d} today={today} href={scheduleHref(PATH, "day", d)} />,
                entries: personEntries(d),
              }))}
            />
          ) : (
            <MonthGrid
              weeks={monthWeeks(date)}
              month={date.slice(0, 7)}
              today={today}
              entriesByDate={new Map(dates.map((d) => [d, personEntries(d)]))}
              dayHref={(d) => scheduleHref(PATH, "day", d)}
            />
          )}
        </>
      )}

      <p className="mt-3 text-xs text-neutral-500">
        緑は社員の予定、青は部署の予約（お客様名は出しません）、破線は部署の予定（会議・研修など）、
        紫は本人がつないだGoogleカレンダーの予定（件名を出すかは本人が アカウント情報 で選びます。反映は最大10分遅れます）。
        私用にした予定は、本人以外には「予定あり」とだけ表示されます。
        ここで入れた予定は、その人がいる全部署の予約受付で「空いていない時間」になります。
      </p>
    </main>
  );
}
