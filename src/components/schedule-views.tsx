/**
 * 全体スケジュール・自分の予定で共通に使う、予定の並べ方の部品。
 *
 *   ・ScheduleNav  … 日・週・月の切り替え、前へ／次へ、日付を選んで飛ぶ欄
 *   ・TimelineGrid … 列ごとに時刻に沿って並べる表（全体スケジュールの1日＝1人1列、週＝1日1列）
 *   ・MonthGrid    … 月のマス目。マスには「10:00 打ち合わせ」を数件。予定を入れられるなら、マスを押すとその日付で入力欄が開き、
 *                    日付の数字を押すとその日の1日表示へ（入れられないならマス全体が1日表示へのリンク）
 */
import Link from "next/link";
import type { ReactNode } from "react";
import {
  NAV_LABELS,
  type ScheduleView,
  containsToday,
  shiftDate,
  viewTitle,
} from "@/lib/schedule-range";
import { isAllDay, layoutLanes, timeRangeOf, timeRangeText } from "@/lib/team-view";
import type { EditTarget } from "@/lib/entry-edit";
import { EntryButton } from "./entry-button";
import { MonthDayCell, TapToAddLayer } from "./tap-to-add-layer";

export { AddEntryPanel } from "./add-entry-panel";
import { dayTint, holidayName } from "@/lib/jp-holidays";
import { dayOfWeekOf, toHm } from "@/lib/time";

export type ScheduleEntry = {
  key: string;
  kind: "event" | "reservation" | "elsewhere" | "block" | "google";
  startMinutes: number;
  endMinutes: number;
  label: string;
  /** 補足（部署名・お客様名など） */
  note: string | null;
  /** 押すと開く先（予約の詳細など） */
  href?: string;
  /** 項目の右上に置く操作（× で消すフォームなど） */
  action?: ReactNode;
  /** 押すと直す・消す欄が開く予定なら、その中身（entry-edit.ts） */
  edit?: EditTarget;
};

export const ENTRY_STYLE: Record<ScheduleEntry["kind"], string> = {
  event: "border-emerald-300 bg-emerald-50 text-emerald-900",
  reservation: "border-sky-300 bg-sky-50 text-sky-900",
  elsewhere: "border-teal-300 bg-teal-50 text-teal-900",
  block: "border-dashed border-amber-400 bg-amber-50 text-amber-900",
  google: "border-violet-300 bg-violet-50 text-violet-900",
};

/** 消している途中（中の送信ボタンが aria-busy）の予定は薄くして、押したことがすぐわかるようにする */
const BUSY_FADE = "has-[[aria-busy=true]]:pointer-events-none has-[[aria-busy=true]]:opacity-40";

/** 日・週・月と日付・そのほかの条件（選んだ人など）から、画面のURLを作る。1日表示は view を付けない */
export function scheduleHref(
  basePath: string,
  view: ScheduleView,
  date: string,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();
  if (view !== "day") params.set("view", view);
  params.set("date", date);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return `${basePath}?${params.toString()}`;
}

const VIEW_NAMES: { view: ScheduleView; label: string }[] = [
  { view: "day", label: "日" },
  { view: "week", label: "週" },
  { view: "month", label: "月" },
];

export function ScheduleNav({
  basePath,
  view,
  date,
  today,
  extra = {},
  children,
}: {
  basePath: string;
  view: ScheduleView;
  date: string;
  today: string;
  /** 切り替えても持ち越す条件（全体スケジュールの週・月で選んでいる人） */
  extra?: Record<string, string>;
  /** 見出しの横に足すもの（人を選ぶ欄など） */
  children?: ReactNode;
}) {
  const labels = NAV_LABELS[view];
  const href = (v: ScheduleView, d: string) => scheduleHref(basePath, v, d, extra);

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-neutral-300" role="group" aria-label="表示の切り替え">
            {VIEW_NAMES.map(({ view: v, label }) => (
              <Link
                key={v}
                href={href(v, date)}
                aria-current={v === view ? "page" : undefined}
                className={`px-3 py-1.5 text-sm ${
                  v === view ? "bg-neutral-800 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          <h2 className="text-lg font-semibold">{viewTitle(view, date)}</h2>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink href={href(view, shiftDate(view, date, -1))} label={labels.prev} />
          <NavLink href={href(view, today)} label={labels.current} highlight={containsToday(view, date, today)} />
          <NavLink href={href(view, shiftDate(view, date, 1))} label={labels.next} />
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {children}
        {/* 日付を選んで飛ぶ。入力の途中で動かないよう、ボタンを押したときだけ動く */}
        <form method="get" action={basePath} className="flex items-center gap-1">
          {view !== "day" && <input type="hidden" name="view" value={view} />}
          {Object.entries(extra).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input
            key={date}
            type="date"
            name="date"
            defaultValue={date}
            required
            aria-label="表示する日付"
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            移動
          </button>
        </form>
      </div>
    </div>
  );
}

function NavLink({ href, label, highlight }: { href: string; label: string; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-1.5 text-sm ${
        highlight
          ? "border-neutral-800 bg-neutral-800 text-white"
          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </Link>
  );
}

const PX_PER_MIN = 1.1;

/** 土日祝の薄い色（週・月の表で共通） */
const TINT_BG = { sat: "bg-sky-50/70", sun: "bg-red-50/70" } as const;
const TINT_TEXT = { sat: "text-sky-700", sun: "text-red-600" } as const;

function columnBackground(col: TimelineColumn): string {
  if (col.highlight) return "bg-emerald-50/40";
  const tint = col.date ? dayTint(col.date) : null;
  return tint ? TINT_BG[tint] : "";
}

export type TimelineColumn = {
  key: string;
  header: ReactNode;
  /** 自分の列・今日の列を薄く色付けする */
  highlight?: boolean;
  /** 1日1列の表（週表示）なら、その日付。土曜は薄い青、日曜・祝日は薄い赤にする */
  date?: string;
  entries: ScheduleEntry[];
  /** 空いているところを押して予定を足せる列なら、その日付（と誰の予定か） */
  tapToAdd?: { date: string; employeeId?: string };
};

export function TimelineGrid({
  columns,
  columnClassName,
}: {
  columns: TimelineColumn[];
  /** 列の幅。1日表示（人が並ぶ）は固定幅、週表示は画面幅に合わせて広げる */
  columnClassName: string;
}) {
  const range = timeRangeOf(columns.flatMap((c) => c.entries));
  const totalHeight = (range.end - range.start) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = range.start; m <= range.end; m += 60) hours.push(m);
  const top = (m: number) => (m - range.start) * PX_PER_MIN;

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <div className="flex w-full min-w-max">
        {/* 時刻の列。横にスクロールしても見えるよう左に固定する */}
        <div className="sticky left-0 z-20 w-12 shrink-0 border-r border-neutral-200 bg-white">
          <div className="h-14 border-b border-neutral-200" />
          <div className="relative" style={{ height: totalHeight }}>
            {hours.map((m) => (
              <div
                key={m}
                className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-neutral-400"
                style={{ top: top(m) }}
              >
                {toHm(m)}
              </div>
            ))}
          </div>
        </div>

        {columns.map((col) => (
          <div
            key={col.key}
            className={`border-r border-neutral-100 ${columnClassName} ${columnBackground(col)}`}
          >
            <div className="h-14 border-b border-neutral-200 px-1.5 py-1.5">{col.header}</div>
            <div className="relative" style={{ height: totalHeight }}>
              {hours.map((m) => (
                <div
                  key={m}
                  className="absolute inset-x-0 border-t border-neutral-100"
                  style={{ top: top(m) }}
                />
              ))}
              {col.tapToAdd && (
                <TapToAddLayer {...col.tapToAdd} rangeStart={range.start} pxPerMinute={PX_PER_MIN} />
              )}
              {layoutLanes(col.entries).map(({ item, lane, lanes }) => {
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-0.5">
                      <span className="truncate font-medium">{item.label}</span>
                      {item.action}
                    </div>
                    <div className="truncate tabular-nums opacity-75">
                      {timeRangeText(item)}
                    </div>
                    {item.note && <div className="truncate opacity-75">{item.note}</div>}
                  </>
                );
                const className = `absolute overflow-hidden rounded border px-1 py-0.5 text-[11px] leading-tight transition-opacity ${BUSY_FADE} ${ENTRY_STYLE[item.kind]}`;
                const style = {
                  // 終日の予定は表示している時間の範囲に収める
                  top: top(Math.max(item.startMinutes, range.start)),
                  height: Math.max(
                    (Math.min(item.endMinutes, range.end) - Math.max(item.startMinutes, range.start)) *
                      PX_PER_MIN -
                      2,
                    14,
                  ),
                  left: `calc(${(lane / lanes) * 100}% + 2px)`,
                  width: `calc(${100 / lanes}% - 4px)`,
                };
                const title = `${timeRangeText(item)} ${item.label}${item.note ? `（${item.note}）` : ""}`;
                if (item.edit) {
                  return (
                    <EntryButton key={item.key} target={item.edit} title={title} className={className} style={style}>
                      {body}
                    </EntryButton>
                  );
                }
                return item.href ? (
                  <Link key={item.key} href={item.href} title={title} className={`${className} hover:brightness-95`} style={style}>
                    {body}
                  </Link>
                ) : (
                  <div key={item.key} title={title} className={className} style={style}>
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const WEEKDAY_HEADERS = ["月", "火", "水", "木", "金", "土", "日"];
const MAX_PER_DAY = 3;

/** 週表示の列の見出し（日付。押すとその日の1日表示へ） */
export function DayColumnHeader({ date, href, today }: { date: string; href: string; today: string }) {
  const [, m, d] = date.split("-").map(Number);
  const dow = dayOfWeekOf(date);
  const tint = dayTint(date);
  const holiday = holidayName(date);
  return (
    <Link href={href} className="block rounded px-0.5 hover:bg-neutral-100">
      <div className={`text-sm font-medium tabular-nums ${tint ? TINT_TEXT[tint] : ""}`}>
        {m}/{d}（{WEEKDAY_HEADERS[(dow + 6) % 7]}）
      </div>
      <div
        className={`truncate text-[11px] ${holiday ? "text-red-600" : "text-neutral-500"}`}
        title={holiday ?? undefined}
      >
        {[date === today ? "今日" : null, holiday].filter(Boolean).join("・") || "　"}
      </div>
    </Link>
  );
}

export function MonthGrid({
  weeks,
  month,
  today,
  entriesByDate,
  dayHref,
  tapToAdd,
}: {
  weeks: string[][];
  /** 見ている月 "YYYY-MM"（前後の月の日は薄くする） */
  month: string;
  today: string;
  entriesByDate: Map<string, ScheduleEntry[]>;
  dayHref: (date: string) => string;
  /** マスを押して予定を入れられるか（全体スケジュールでは誰の予定にするかも） */
  tapToAdd?: { employeeId?: string };
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50 text-center text-xs font-medium">
        {WEEKDAY_HEADERS.map((w, i) => (
          <div key={w} className={`py-1 ${i === 5 ? "text-sky-700" : i === 6 ? "text-red-600" : "text-neutral-600"}`}>
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid grid-cols-7 border-b border-neutral-100 last:border-b-0">
          {week.map((date) => {
            const entries = [...(entriesByDate.get(date) ?? [])].sort(
              (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
            );
            const inMonth = date.slice(0, 7) === month;
            const day = Number(date.slice(8));
            const tint = dayTint(date);
            const holiday = holidayName(date);
            const dayNumberClass = `flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums ${
              date === today ? "bg-neutral-800 font-semibold text-white" : tint && inMonth ? TINT_TEXT[tint] : ""
            }`;
            const cellClass = `block min-h-20 min-w-0 border-r border-neutral-100 p-0.5 last:border-r-0 hover:bg-neutral-50 sm:min-h-24 sm:p-1 ${
              inMonth ? (tint ? TINT_BG[tint] : "") : "bg-neutral-50/70 text-neutral-400"
            }`;
            const content = (
              <>
                <div className="mb-0.5 flex min-w-0 items-center justify-center gap-1 sm:justify-start">
                  {tapToAdd ? (
                    <Link
                      href={dayHref(date)}
                      aria-label={`${Number(date.slice(5, 7))}月${day}日（${entries.length}件）を1日表示で見る`}
                      className={`${dayNumberClass} underline-offset-2 hover:underline hover:ring-1 hover:ring-neutral-400`}
                    >
                      {day}
                    </Link>
                  ) : (
                    <span className={dayNumberClass}>{day}</span>
                  )}
                  {/* 祝日の名前。スマホではマスが狭いので、少し広い画面からだけ出す */}
                  {holiday && (
                    <span
                      className={`hidden truncate text-[10px] sm:inline ${inMonth ? "text-red-600" : ""}`}
                      title={holiday}
                    >
                      {holiday}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {entries.slice(0, MAX_PER_DAY).map((e) => {
                    const chipClass = `block w-full truncate rounded border px-0.5 text-[10px] leading-snug sm:text-[11px] ${ENTRY_STYLE[e.kind]} ${
                      inMonth ? "" : "opacity-60"
                    }`;
                    const chip = (
                      <>
                        <span className="tabular-nums">{isAllDay(e) ? "終日" : toHm(e.startMinutes)}</span>
                        {/* スマホではマスが狭いので、件名は少し広い画面からだけ出す */}
                        <span className="ml-0.5 hidden sm:inline">{e.label}</span>
                      </>
                    );
                    return e.edit && tapToAdd ? (
                      <EntryButton key={e.key} target={e.edit} title={`${timeRangeText(e)} ${e.label}`} className={chipClass}>
                        {chip}
                      </EntryButton>
                    ) : (
                      <div key={e.key} title={`${timeRangeText(e)} ${e.label}`} className={chipClass}>
                        {chip}
                      </div>
                    );
                  })}
                  {entries.length > MAX_PER_DAY && (
                    <div className="px-0.5 text-[10px] text-neutral-500">他{entries.length - MAX_PER_DAY}件</div>
                  )}
                </div>
              </>
            );
            return tapToAdd ? (
              <MonthDayCell key={date} date={date} employeeId={tapToAdd.employeeId} className={cellClass}>
                {content}
              </MonthDayCell>
            ) : (
              <Link
                key={date}
                href={dayHref(date)}
                aria-label={`${Number(date.slice(5, 7))}月${day}日（${entries.length}件）を1日表示で見る`}
                className={cellClass}
              >
                {content}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}


/** 色の見方（サイドバーの「？ 使い方・色の見方」に出す）。見本の色は表の予定と同じ */
export function ColorLegend({ items }: { items: { kind: ScheduleEntry["kind"]; label: ReactNode }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.kind} className="flex items-start gap-1.5">
          <span className={`mt-0.5 size-3 shrink-0 rounded-sm border ${ENTRY_STYLE[item.kind]}`} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
