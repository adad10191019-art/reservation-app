import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { buildOnboardingStatus } from "@/lib/onboarding";

export default async function OnboardingSettingsPage() {
  const session = await requireOwner();
  const status = await buildOnboardingStatus(session.tenantId);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">導入のセットアップ状況</h2>
          <span className="text-sm tabular-nums text-neutral-600">
            {status.doneCount} / {status.totalCount} 完了
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width]"
            style={{ width: `${(status.doneCount / status.totalCount) * 100}%` }}
          />
        </div>

        {status.allDone ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            すべての項目が終わっています。お客様向けの予約ページを案内できます。
          </p>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            新しいクライアントを導入するときに、上から順番に進めてください。
            順番どおりでなくても構いませんが、営業時間とメニューが無いと予約自体を受け付けられません。
          </p>
        )}
      </section>

      <section className="space-y-3">
        {status.steps.map((step, index) => (
          <div
            key={step.key}
            className={`rounded-lg border p-4 ${
              step.done ? "border-emerald-200 bg-emerald-50/40" : "border-neutral-200 bg-white"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.done
                      ? "bg-emerald-500 text-white"
                      : "border border-neutral-300 text-neutral-500"
                  }`}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <div>
                  <p className="font-medium text-neutral-800">{step.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                    {step.description}
                  </p>
                  {step.note && (
                    <p className="mt-1 text-xs font-medium text-neutral-600">{step.note}</p>
                  )}
                </div>
              </div>

              <Link
                href={step.href}
                className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {step.linkLabel}
              </Link>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-2 font-medium">お客様向けの予約ページ（確認用）</h3>
        <p className="mb-2 break-all rounded-md bg-neutral-50 px-3 py-2 font-mono text-sm">
          {status.bookingUrlPath}
        </p>
        <Link
          href={status.bookingUrlPath}
          target="_blank"
          className="inline-block rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          新しいタブで開いて確認する
        </Link>
      </section>
    </div>
  );
}
