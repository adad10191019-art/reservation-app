import { requireOwner } from "@/lib/auth";
import { buildReservationSummary } from "@/lib/analytics";
import { addDays, formatDateLabel, sanitizeDate, todayString } from "@/lib/time";

const STATUS_LABEL: Record<string, string> = {
  booked: "予約中",
  done: "完了",
  canceled: "キャンセル",
  no_show: "無断キャンセル",
};

const STATUS_ORDER = ["booked", "done", "canceled", "no_show"];

/** よく使う期間へのショートカット */
function presets(today: string) {
  const monthStart = `${today.slice(0, 7)}-01`;
  return [
    { label: "直近7日間", from: addDays(today, -6), to: today },
    { label: "直近30日間", from: addDays(today, -29), to: today },
    { label: "今月", from: monthStart, to: today },
  ];
}

/** 表の横にCSSだけで積む簡易棒グラフ。外部のグラフライブラリを入れるほどの規模ではない */
function Bar({ ratio, className = "" }: { ratio: number; className?: string }) {
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className={`h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 ${className}`}>
      <div className="h-full rounded-full bg-sky-500" style={{ width: `${width}%` }} />
    </div>
  );
}

export default async function AnalyticsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOwner();

  const today = todayString();
  const from = sanitizeDate(sp.from ?? addDays(today, -29));
  const toRaw = sanitizeDate(sp.to ?? today);
  const to = from <= toRaw ? toRaw : from;

  const summary = await buildReservationSummary(session.tenantId, from, to);

  const maxDaily = Math.max(1, ...summary.dailyCounts.map((d) => d.count));
  const maxHourly = Math.max(1, ...summary.hourlyCounts.map((h) => h.count));
  const maxStaff = Math.max(1, ...summary.byStaff.map((s) => s.count));
  const maxMenu = Math.max(1, ...summary.byMenu.map((m) => m.count));

  const exportHref = `/api/settings/reservations/export?from=${from}&to=${to}`;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">集計期間</h2>

        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">開始日</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">終了日</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            表示する
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {presets(today).map((p) => (
            <a
              key={p.label}
              href={`/settings/analytics?from=${p.from}&to=${p.to}`}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              {p.label}
            </a>
          ))}
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          {formatDateLabel(from)} 〜 {formatDateLabel(to)} の集計です。
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">予約件数（合計）</p>
          <p className="mt-1 text-2xl font-semibold">{summary.totalCount}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">完了</p>
          <p className="mt-1 text-2xl font-semibold">{summary.byStatus.done ?? 0}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">キャンセル・無断</p>
          <p className="mt-1 text-2xl font-semibold">
            {(summary.byStatus.canceled ?? 0) + (summary.byStatus.no_show ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">売上（予約中＋完了の合計）</p>
          <p className="mt-1 text-2xl font-semibold">¥{summary.salesTotal.toLocaleString("ja-JP")}</p>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">ステータスの内訳</h2>
        <div className="mt-3 space-y-2">
          {STATUS_ORDER.map((status) => {
            const count = summary.byStatus[status] ?? 0;
            const ratio = summary.totalCount > 0 ? count / summary.totalCount : 0;
            return (
              <div key={status} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-neutral-600">{STATUS_LABEL[status]}</span>
                <Bar ratio={ratio} />
                <span className="w-10 shrink-0 text-right tabular-nums text-neutral-600">{count}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">日ごとの予約件数の推移</h2>
        {summary.dailyCounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">データがありません</p>
        ) : (
          <div className="mt-3 flex h-32 items-end gap-px overflow-x-auto">
            {summary.dailyCounts.map((d) => (
              <div
                key={d.date}
                title={`${formatDateLabel(d.date)}：${d.count}件`}
                className="w-2 min-w-[2px] flex-1 rounded-t bg-sky-500"
                style={{ height: `${Math.max(2, (d.count / maxDaily) * 100)}%` }}
              />
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          {formatDateLabel(from)} から {formatDateLabel(to)}。バーにカーソルを合わせると日付と件数が出ます。
        </p>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">よく埋まる時間帯</h2>
        <p className="mb-3 text-xs text-neutral-500">予約の開始時刻が、何時台に多いか。</p>
        <div className="space-y-1.5">
          {summary.hourlyCounts
            .filter((h) => h.count > 0 || (h.hour >= 8 && h.hour <= 21))
            .map((h) => (
              <div key={h.hour} className="flex items-center gap-3 text-sm">
                <span className="w-10 shrink-0 tabular-nums text-neutral-600">{h.hour}時</span>
                <Bar ratio={h.count / maxHourly} />
                <span className="w-10 shrink-0 text-right tabular-nums text-neutral-600">{h.count}</span>
              </div>
            ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">担当者別の件数</h2>
          {summary.byStaff.length === 0 ? (
            <p className="text-sm text-neutral-500">データがありません</p>
          ) : (
            <div className="space-y-2">
              {summary.byStaff.map((s) => (
                <div key={s.staffId} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 truncate text-neutral-600">{s.name}</span>
                  <Bar ratio={s.count / maxStaff} />
                  <span className="w-10 shrink-0 text-right tabular-nums text-neutral-600">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">メニュー別の件数</h2>
          {summary.byMenu.length === 0 ? (
            <p className="text-sm text-neutral-500">データがありません</p>
          ) : (
            <div className="space-y-2">
              {summary.byMenu.map((m) => (
                <div key={m.menuId} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 truncate text-neutral-600">{m.name}</span>
                  <Bar ratio={m.count / maxMenu} />
                  <span className="w-10 shrink-0 text-right tabular-nums text-neutral-600">{m.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">予約データのエクスポート</h2>
        <p className="mb-3 text-xs leading-relaxed text-neutral-500">
          上で選んだ期間（{formatDateLabel(from)} 〜 {formatDateLabel(to)}）の予約一覧をCSVで書き出します。
          顧客管理や経理への取り込みに使えます。
        </p>
        <a
          href={exportHref}
          className="inline-block rounded-md border border-neutral-300 bg-white px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          CSVをダウンロード
        </a>
      </section>
    </div>
  );
}
