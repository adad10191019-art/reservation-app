import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { requireTeamSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/schedule";
import { getTeamDay, getTeamViewer } from "@/lib/team";
import { createEmployeeEvent, deleteEmployeeEvent } from "@/lib/team-actions";
import { type TeamItem, layoutLanes, teamViewRange } from "@/lib/team-view";
import { addDays, formatDateLabel, sanitizeDate, toHm, todayString } from "@/lib/time";

const PX_PER_MIN = 1.1;
const COLUMN_WIDTH = 132;

const ITEM_STYLE: Record<TeamItem["kind"], string> = {
  event: "border-emerald-300 bg-emerald-50 text-emerald-900",
  reservation: "border-sky-300 bg-sky-50 text-sky-900",
  block: "border-dashed border-amber-400 bg-amber-50 text-amber-900",
};

/** 社員全員の1日の予定を、1人1列で並べる画面 */
export default async function TeamDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const date = sanitizeDate(sp.date);
  const today = todayString();

  const session = await requireTeamSession();
  // 社員（部署に属さない人）には部署が無いので、見出しは「全社」にする
  const [tenant, viewer] = await Promise.all([
    session.tenantId ? getTenant(session.tenantId) : { name: "全社" },
    getTeamViewer(session),
  ]);
  const columns = await getTeamDay(date, viewer);
  const range = teamViewRange(columns);
  const totalHeight = (range.end - range.start) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = range.start; m <= range.end; m += 60) hours.push(m);
  const top = (m: number) => (m - range.start) * PX_PER_MIN;

  // 全社管理者は、誰の予定を入れるか選べる
  const employeeChoices = viewer.isAdmin
    ? await prisma.employee.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      })
    : [];
  const canAdd = viewer.employeeId !== null || viewer.isAdmin;

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="全社の1日" session={session}>
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

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{formatDateLabel(date)}</h2>
        <nav className="flex items-center gap-1">
          <DateLink date={addDays(date, -1)} label="← 前日" />
          <DateLink date={today} label="今日" highlight={date === today} />
          <DateLink date={addDays(date, 1)} label="翌日 →" />
        </nav>
      </div>

      {canAdd ? (
        <form
          action={createEmployeeEvent}
          className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-3"
        >
          <input type="hidden" name="date" value={date} />
          {viewer.isAdmin && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">誰の予定</span>
              <select
                name="employeeId"
                defaultValue={viewer.employeeId ?? ""}
                required
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                {viewer.employeeId === null && <option value="">選んでください</option>}
                {employeeChoices.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id === viewer.employeeId ? `${e.name}（自分）` : e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">開始</span>
            <input
              type="time"
              name="start"
              required
              step={300}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">終了</span>
            <input
              type="time"
              name="end"
              required
              step={300}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
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
        </form>
      ) : (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          このアカウントは社員名簿とひも付いていないため、予定を入れられません（見ることはできます）。
          全社管理者に、名簿とのひも付けを依頼してください。
        </p>
      )}

      {columns.length === 0 ? (
        <p className="rounded-md border border-neutral-200 bg-white px-3 py-6 text-center text-sm text-neutral-500">
          社員名簿がまだ空です。
          {viewer.isAdmin && (
            <>
              {" "}
              <Link href="/settings/employees" className="text-sky-700 underline">
                設定 → 社員名簿
              </Link>
              から登録してください。
            </>
          )}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <div className="flex min-w-max">
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
                key={col.employeeId}
                className={`shrink-0 border-r border-neutral-100 ${col.isMe ? "bg-emerald-50/40" : ""}`}
                style={{ width: COLUMN_WIDTH }}
              >
                <div className="h-14 border-b border-neutral-200 px-1.5 py-1.5">
                  <div className="truncate text-sm font-medium" title={col.name}>
                    {col.name}
                    {col.isMe && <span className="ml-1 text-xs text-emerald-700">（自分）</span>}
                  </div>
                  <div
                    className="truncate text-[11px] text-neutral-500"
                    title={col.departments.join("・")}
                  >
                    {col.departments.length > 0 ? col.departments.join("・") : "　"}
                  </div>
                </div>
                <div className="relative" style={{ height: totalHeight }}>
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="absolute inset-x-0 border-t border-neutral-100"
                      style={{ top: top(m) }}
                    />
                  ))}
                  {layoutLanes(col.items).map(({ item, lane, lanes }) => (
                    <div
                      key={item.key}
                      title={`${toHm(item.startMinutes)}–${toHm(item.endMinutes)} ${item.label}${item.note ? `（${item.note}）` : ""}`}
                      className={`absolute overflow-hidden rounded border px-1 py-0.5 text-[11px] leading-tight ${ITEM_STYLE[item.kind]}`}
                      style={{
                        top: top(item.startMinutes),
                        height: Math.max((item.endMinutes - item.startMinutes) * PX_PER_MIN - 2, 14),
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-0.5">
                        <span className="truncate font-medium">{item.label}</span>
                        {item.deletableEventId && (
                          <form action={deleteEmployeeEvent}>
                            <input type="hidden" name="id" value={item.deletableEventId} />
                            <input type="hidden" name="date" value={date} />
                            <button
                              type="submit"
                              aria-label={`${item.label} を削除`}
                              className="rounded px-0.5 text-neutral-500 hover:bg-white hover:text-red-700"
                            >
                              ×
                            </button>
                          </form>
                        )}
                      </div>
                      <div className="truncate tabular-nums opacity-75">
                        {toHm(item.startMinutes)}–{toHm(item.endMinutes)}
                      </div>
                      {item.note && <div className="truncate opacity-75">{item.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-500">
        緑は社員の予定、青は部署の予約（お客様名は出しません）、破線は部署の予定（会議・研修など）。
        私用にした予定は、本人以外には「予定あり」とだけ表示されます。
        ここで入れた予定は、その人がいる全部署の予約受付で「空いていない時間」になります。
      </p>
    </main>
  );
}

function DateLink({ date, label, highlight }: { date: string; label: string; highlight?: boolean }) {
  return (
    <Link
      href={`/team?date=${date}`}
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
