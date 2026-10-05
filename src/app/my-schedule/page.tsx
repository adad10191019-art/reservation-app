import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { EntryButton } from "@/components/entry-button";
import { EntryEditor } from "@/components/entry-editor";
import { HelpTip, SidebarHelp } from "@/components/help-tip";
import { type EditTarget, googleEditTarget } from "@/lib/entry-edit";
import { deleteEmployeeEvent, deleteMyGoogleEvent, updateEmployeeEvent, updateMyGoogleEvent } from "@/lib/team-actions";
import {
  AddEntryPanel,
  ColorLegend,
  DayColumnHeader,
  MonthGrid,
  ScheduleNav,
  type ScheduleEntry,
  TimelineGrid,
  scheduleHref,
} from "@/components/schedule-views";
import { GoogleBrokenNotice } from "@/components/google-broken-notice";
import { SubmitButton } from "@/components/submit-button";
import { TimeRangeFields } from "@/components/time-range-fields";
import { requireSession } from "@/lib/auth";
import { fetchGoogleEventsOfDates, isGoogleCalendarConfigured } from "@/lib/google-calendar";
import { fetchMyCalendar } from "@/lib/my-calendar";
import { type ElsewhereItem, fetchMyElsewhere } from "@/lib/my-elsewhere";
import { prisma } from "@/lib/prisma";
import { getDaySchedule, getTenant } from "@/lib/schedule";
import { monthWeeks, parseView, viewDates } from "@/lib/schedule-range";
import { createOwnBlock, deleteOwnBlock, updateOwnBlock } from "@/lib/staff-schedule-actions";
import { isAllDay, timeRangeText } from "@/lib/team-view";
import { formatDateLabel, sanitizeDate, toHm, todayString } from "@/lib/time";
import { defaultStart } from "@/lib/time-choices";

const PATH = "/my-schedule";

type AgendaItem =
  | { kind: "reservation"; id: string; startMinutes: number; endMinutes: number; menuName: string; customerName: string }
  | { kind: "block"; id: string; startMinutes: number; endMinutes: number; reason: string; wholeShop: boolean }
  | {
      kind: "google";
      startMinutes: number;
      endMinutes: number;
      title: string | null;
      id?: string;
      editable?: boolean;
    }
  | ElsewhereItem;

export default async function MySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; error?: string; done?: string; added?: string }>;
}) {
  const sp = await searchParams;
  const date = sanitizeDate(sp.date);
  const view = parseView(sp.view);
  const today = todayString();
  const returnTo = scheduleHref(PATH, view, date);
  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);

  // 今足した自分のブロック枠（まだあるものだけ）。「保存しました」の横に「取り消す」を出し、間違えてもすぐ消せるようにする
  const added =
    sp.done && sp.added && session.staffId
      ? await prisma.block.findFirst({ where: { id: sp.added, tenantId: session.tenantId, staffId: session.staffId } })
      : null;
  const banner = (
    <Banner
      error={sp.error}
      done={sp.done}
      doneText={added ? `${formatDateLabel(added.date)}「${added.reason}」（${timeRangeText(added)}）を追加しました。` : undefined}
      doneAction={
        added && (
          <form action={deleteOwnBlock}>
            <input type="hidden" name="id" value={added.id} />
            <input type="hidden" name="date" value={added.date} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <SubmitButton
              pendingText="取り消し中…"
              className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              取り消す
            </SubmitButton>
          </form>
        )
      }
    />
  );

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
  // Google の連携は人（名簿）に付く。切れていたら上に知らせる
  const myEmployeeId =
    (await prisma.staff.findUnique({ where: { id: staffId }, select: { employeeId: true } }))?.employeeId ?? null;

  if (view !== "day") {
    // 週・月：自分の予定の全部をカレンダーの形で並べる。日付を押すとその日の1日表示へ
    const dates = viewDates(view, date);
    const items = await fetchMyCalendar({ userId: session.userId, tenantId: tenant.id, staffId, dates });
    const entriesOf = (d: string): ScheduleEntry[] => items.filter((i) => i.date === d);

    return (
      <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        <MyScheduleHeader
          tenantName={tenant.name}
          session={session}
          date={date}
          help={
            <SidebarHelp title="使い方・色の見方">
              <p>
                ここにある内容は<strong>自分（{session.name}）の分だけ</strong>です。
                兼任先の部署の予約・全体スケジュールの予定・Googleカレンダーの予定もまとめて出します。
              </p>
              <p>
                「＋ 追加」か、表の空いているところを押すと予定を入れられます。月表示ではマスを押すとその日付で開き、
                日付の数字を押すとその日の一覧が出ます。
              </p>
              <ColorLegend
                items={[
                  { kind: "reservation", label: `${tenant.name}の予約（押すと詳細）` },
                  { kind: "elsewhere", label: "兼任先の部署の予約" },
                  { kind: "block", label: "ブロック枠（ここで入れた自分の予定）" },
                  { kind: "event", label: "全体スケジュールで入れた予定" },
                  { kind: "google", label: "Googleカレンダーの予定" },
                ]}
              />
            </SidebarHelp>
          }
        />
        {banner}
        <GoogleBrokenNotice employeeId={myEmployeeId} />
        <ScheduleNav basePath={PATH} view={view} date={date} today={today} />

        <AddEntryPanel>
          <AddOwnBlockForm date={date} returnTo={returnTo} />
        </AddEntryPanel>

        <section className="mb-5">
          {view === "week" ? (
            <TimelineGrid
              columnClassName="min-w-[88px] flex-1"
              columns={dates.map((d) => ({
                key: d,
                highlight: d === today,
                date: d,
                header: <DayColumnHeader date={d} today={today} href={scheduleHref(PATH, "day", d)} />,
                entries: entriesOf(d),
                tapToAdd: { date: d },
              }))}
            />
          ) : (
            <MonthGrid
              weeks={monthWeeks(date)}
              month={date.slice(0, 7)}
              today={today}
              entriesByDate={new Map(dates.map((d) => [d, entriesOf(d)]))}
              dayHref={(d) => scheduleHref(PATH, "day", d)}
              tapToAdd={{}}
            />
          )}
        </section>
        <EntryEditor
          returnTo={returnTo}
          actions={{
            block: { update: updateOwnBlock, remove: deleteOwnBlock },
            event: { update: updateEmployeeEvent, remove: deleteEmployeeEvent },
            google: { update: updateMyGoogleEvent, remove: deleteMyGoogleEvent },
          }}
        />
      </main>
    );
  }

  const [schedule, ownBlocks, googleConnection, elsewhere] = await Promise.all([
    getDaySchedule({ tenantId: tenant.id, date }),
    prisma.block.findMany({
      where: { tenantId: tenant.id, date, staffId },
      orderBy: { startMinutes: "asc" },
    }),
    isGoogleCalendarConfigured()
      ? // Google カレンダーの連携は人（名簿）に付く
        prisma.staff
          .findUnique({ where: { id: staffId }, select: { employee: { select: { googleCalendarConnection: true } } } })
          .then((staff) => staff?.employee?.googleCalendarConnection ?? null)
      : null,
    fetchMyElsewhere({ userId: session.userId, tenantId: tenant.id, staffId, dates: [date] }),
  ]);

  // 連携していれば、Googleカレンダーの予定も混ぜる（本人の分なので件名も出す。押すと直す・消す欄が開く）
  const googleBusy = googleConnection
    ? ((await fetchGoogleEventsOfDates(googleConnection, [date], true))?.get(date) ?? [])
    : [];

  // 自分の列だけを取り出す。まだ勤務日として登録されていない
  // （どのメニューにも対応していない等）場合は列自体が無いこともある
  const myColumn = schedule.columns.find((c) => c.staffId === staffId) ?? null;

  // この部署の予約・ブロック枠に、兼任先の部署の分・全体スケジュールで入れた予定・Googleカレンダーの予定を
  // 合わせて、時刻順の1本のリストにまとめる
  const agenda: AgendaItem[] = [
    ...(myColumn?.reservations ?? []).map(
      (r): AgendaItem => ({
        kind: "reservation",
        id: r.id,
        startMinutes: r.startMinutes,
        endMinutes: r.endMinutes,
        menuName: r.menuName,
        customerName: r.customerName,
      }),
    ),
    ...(myColumn?.blocks ?? []).map(
      (b): AgendaItem => ({
        kind: "block",
        id: b.id,
        startMinutes: b.startMinutes,
        endMinutes: b.endMinutes,
        reason: b.reason,
        wholeShop: b.wholeShop,
      }),
    ),
    ...elsewhere,
    ...googleBusy.map(
      (g): AgendaItem => ({
        kind: "google",
        startMinutes: g.start,
        endMinutes: g.end,
        title: g.title,
        id: g.id,
        editable: g.editable,
      }),
    ),
  ].sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <MyScheduleHeader
        tenantName={tenant.name}
        session={session}
        date={date}
        help={
          <SidebarHelp title="使い方">
            <p>
              ここにある内容は<strong>自分（{session.name}）の分だけ</strong>です。
              他のスタッフの予定は見えません・触れません。
            </p>
          </SidebarHelp>
        }
      />

      {banner}
      <GoogleBrokenNotice employeeId={myEmployeeId} />

      <ScheduleNav basePath={PATH} view={view} date={date} today={today} />

      {/* 今日の予定（時刻順のカードリスト） */}
      <section className="mb-5">
        {!myColumn && (
          <p className="mb-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-center text-sm text-neutral-500">
            この日は{tenant.name}で対応できるメニューが無いため、{tenant.name}の予定は表示できません。
          </p>
        )}
        {!myColumn && agenda.length === 0 ? null : agenda.length === 0 ? (
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
                      {isAllDay(item) ? "終日" : toHm(item.startMinutes)}
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
              ) : item.kind === "block" ? (
                <AgendaRow
                  key={`b-${item.id}`}
                  // 店舗全体のブロック枠は 設定→日付ごと で直す
                  target={
                    item.wholeShop
                      ? undefined
                      : {
                          kind: "block",
                          id: item.id,
                          date,
                          start: item.startMinutes,
                          end: item.endMinutes,
                          title: item.reason,
                        }
                  }
                  className="flex items-center gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5"
                >
                  <span className="w-11 shrink-0 text-sm font-medium tabular-nums text-amber-800">
                    {isAllDay(item) ? "終日" : toHm(item.startMinutes)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-amber-900">
                      {item.reason}
                      {item.wholeShop && (
                        <span className="ml-1 font-normal text-amber-700">（店舗全体）</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-amber-700">
                      {durationText(item)}
                    </span>
                  </span>
                </AgendaRow>
              ) : item.kind === "elsewhere-reservation" ? (
                // 兼任先の部署の予約。詳しく見る・動かすのはその部署に切り替えてから
                <li
                  key={`er-${item.id}`}
                  className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5"
                >
                  <span className="w-11 shrink-0 text-sm font-medium tabular-nums text-teal-800">
                    {isAllDay(item) ? "終日" : toHm(item.startMinutes)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-teal-900">
                      {item.menuName}
                      <span className="ml-1 font-normal text-teal-700">（{item.tenantName}）</span>
                    </span>
                    <span className="block truncate text-xs text-teal-700">
                      {item.customerName} 様・{durationText(item)}
                    </span>
                  </span>
                </li>
              ) : item.kind === "elsewhere-block" ? (
                <li
                  key={`eb-${item.id}`}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5"
                >
                  <span className="w-11 shrink-0 text-sm font-medium tabular-nums text-amber-800">
                    {isAllDay(item) ? "終日" : toHm(item.startMinutes)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-amber-900">
                      {item.reason}
                      <span className="ml-1 font-normal text-amber-700">（{item.tenantName}）</span>
                    </span>
                    <span className="block truncate text-xs text-amber-700">
                      {durationText(item)}
                    </span>
                  </span>
                </li>
              ) : item.kind === "event" ? (
                <AgendaRow
                  key={`ev-${item.id}`}
                  target={{
                    kind: "event",
                    id: item.id,
                    date,
                    start: item.startMinutes,
                    end: item.endMinutes,
                    title: item.title,
                    isPrivate: item.isPrivate,
                  }}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-100 px-3 py-2.5"
                >
                    <span className="w-11 shrink-0 text-sm font-medium tabular-nums text-neutral-700">
                      {isAllDay(item) ? "終日" : toHm(item.startMinutes)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-800">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-neutral-600">
                        {durationText(item)}・全体スケジュールで入れた予定
                      </span>
                    </span>
                </AgendaRow>
              ) : (
                <AgendaRow
                  key={`g-${item.id ?? ""}-${item.startMinutes}-${item.endMinutes}-${item.title ?? ""}`}
                  target={googleEditTarget(
                    item,
                    { date, start: item.startMinutes, end: item.endMinutes },
                    googleConnection?.canEdit ?? false,
                  )}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-violet-300 bg-violet-50 px-3 py-2.5"
                >
                  <span className="w-11 shrink-0 text-sm font-medium tabular-nums text-violet-800">
                    {isAllDay(item) ? "終日" : toHm(item.startMinutes)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-violet-900">
                      {item.title ?? "予定あり"}
                    </span>
                    <span className="block truncate text-xs text-violet-700">
                      {durationText(item)}・Googleカレンダーの予定
                    </span>
                  </span>
                </AgendaRow>
              ),
            )}
          </ul>
        )}
      </section>

      {/* 自分の予定（ブロック枠） */}
      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <h3 className="font-semibold">自分の予定を追加</h3>
          <HelpTip>
            商談・私用など、予約ではないが時間を空けたくないときに使います。お客様や他のスタッフからは「空いていない時間」として扱われます。
          </HelpTip>
        </div>

        <div className="mb-4">
          <AddOwnBlockForm date={date} returnTo={returnTo} />
        </div>

        {ownBlocks.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-5 text-center text-sm text-neutral-500">
            この日の自分の予定はありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {ownBlocks.map((block) => (
              <li
                key={block.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm transition-opacity has-[[aria-busy=true]]:opacity-40"
              >
                <span className="text-amber-900">
                  <span className="tabular-nums">
                    {timeRangeText(block)}
                  </span>
                  <span className="mx-2 font-medium">{block.reason}</span>
                </span>
                <form action={deleteOwnBlock}>
                  <input type="hidden" name="id" value={block.id} />
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <SubmitButton
                    pendingText="削除中…"
                    confirmText={`「${block.reason}」（${timeRangeText(block)}）を消しますか？`}
                    className="rounded-md border border-amber-400 px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100"
                  >
                    削除
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <EntryEditor
        returnTo={returnTo}
        actions={{
          block: { update: updateOwnBlock, remove: deleteOwnBlock },
          event: { update: updateEmployeeEvent, remove: deleteEmployeeEvent },
          google: { update: updateMyGoogleEvent, remove: deleteMyGoogleEvent },
        }}
      />
    </main>
  );
}

function MyScheduleHeader({
  tenantName,
  session,
  date,
  help,
}: {
  tenantName: string;
  session: Awaited<ReturnType<typeof requireSession>>;
  date: string;
  /** サイドバーの「この画面」に入れる使い方 */
  help: React.ReactNode;
}) {
  // たまにしか使わない移動先は、画面の上に並べずサイドバーの「この画面」にしまう
  const links = [
    { href: `/my-schedule/settings?date=${date}`, label: "予定の設定" },
    { href: `/calendar?date=${date}`, label: "全体を見る（日表示）" },
    { href: `/calendar/week?date=${date}`, label: "全体を見る（週表示）" },
  ];
  return (
    <AppHeader
      tenantName={tenantName}
      subtitle="自分の予定"
      session={session}
      sidebarExtra={
        <>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              {link.label}
            </Link>
          ))}
          {help}
        </>
      }
    />
  );
}

/** 自分の予定（ブロック枠）を足す欄。足したあとは元の表示（日・週・月）の、足した日に戻る */
function AddOwnBlockForm({ date, returnTo }: { date: string; returnTo: string }) {
  return (
    <form action={createOwnBlock} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input
        key={`date-${date}`}
        type="date"
        name="date"
        required
        defaultValue={date}
        aria-label="日付"
        className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
      />
      <TimeRangeFields key={date} defaultStart={defaultStart(date, new Date())} titleName="reason" />
      <input
        type="text"
        name="reason"
        required
        placeholder="商談、私用 など"
        className="min-w-32 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
      />
      <SubmitButton
        pendingText="追加中…"
        className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
      >
        追加
      </SubmitButton>
    </form>
  );
}

/** 一覧に出す長さ（終日なら「1日まるごと」） */
function durationText(item: { startMinutes: number; endMinutes: number }): string {
  return isAllDay(item) ? "1日まるごと" : `${item.endMinutes - item.startMinutes}分`;
}

/** 1日表示の一覧の1行。直せる予定なら、押すと直す・消す欄が開く */
function AgendaRow({
  target,
  className,
  children,
}: {
  target: EditTarget | undefined;
  className: string;
  children: React.ReactNode;
}) {
  if (!target) return <li className={className}>{children}</li>;
  return (
    <li>
      <EntryButton target={target} className={`w-full ${className}`}>
        {children}
      </EntryButton>
    </li>
  );
}
