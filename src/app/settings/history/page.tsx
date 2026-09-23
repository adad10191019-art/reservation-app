import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ENTITY_LABEL: Record<string, string> = {
  block: "予定（ブロック枠）",
  dateOverride: "日付ごとの勤務時間",
};

const ACTION_STYLE: Record<string, string> = {
  created: "border-sky-300 bg-sky-50 text-sky-800",
  deleted: "border-red-300 bg-red-50 text-red-800",
};

const ACTION_LABEL: Record<string, string> = {
  created: "追加",
  deleted: "削除",
};

/** 件数が多くなりすぎないよう、直近の分だけ見せる */
const LIST_LIMIT = 300;

export default async function HistorySettingsPage() {
  const session = await requireOwner();

  const logs = await prisma.changeLog.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">予定の変更履歴</h2>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          スタッフが自分の予定（ブロック枠・日付ごとの勤務時間）を
          追加・削除するたびに記録されます。間違って消してしまったときの手がかりに使ってください。
          記録は消さずに残しています。
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          まだ記録がありません。
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      ACTION_STYLE[log.action] ?? "border-neutral-300 bg-neutral-50 text-neutral-600"
                    }`}
                  >
                    {ACTION_LABEL[log.action] ?? log.action}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {ENTITY_LABEL[log.entity] ?? log.entity}
                  </span>
                </div>
                <p className="mt-1">{log.summary}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{log.actorName} が操作</p>
              </div>
              <time className="shrink-0 whitespace-nowrap text-xs tabular-nums text-neutral-400">
                {log.createdAt.toLocaleString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </li>
          ))}
        </ul>
      )}

      {logs.length === LIST_LIMIT && (
        <p className="text-xs text-neutral-500">
          直近{LIST_LIMIT}件のみ表示しています。
        </p>
      )}
    </div>
  );
}
