"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type EditTarget, onEntryEdit } from "@/lib/entry-edit";
import { timeRangeText } from "@/lib/team-view";
import { formatDateLabel } from "@/lib/time";
import { SubmitButton } from "./submit-button";
import { TimeRangeFields } from "./time-range-fields";

type FormAction = (formData: FormData) => Promise<void>;

export type EntryEditorActions = Partial<Record<EditTarget["kind"], { update: FormAction; remove: FormAction }>>;

const KIND_LABEL: Record<EditTarget["kind"], string> = {
  event: "全体スケジュールの予定",
  block: "自分の予定（ブロック枠）",
  google: "Googleカレンダーの予定",
};

/**
 * 予定を押すと開く、直す・消すための欄（スマホでは下から出る）。ページに1つ置き、
 * 予定の表・一覧の予定（entry-button.tsx）から entry-edit.ts の合図で開く。
 * 保存・削除のあとは元の表示（returnTo）に戻り、上に「保存しました」が出る。
 */
export function EntryEditor({ actions, returnTo }: { actions: EntryEditorActions; returnTo: string }) {
  const [target, setTarget] = useState<EditTarget | null>(null);

  useEffect(() => onEntryEdit(setTarget), []);
  useEffect(() => {
    if (!target) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setTarget(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [target]);

  if (!target) return null;
  const action = actions[target.kind];
  const readOnly = target.readOnlyReason ?? (action ? null : "この画面からは直せない予定です");
  const titleLabel = target.kind === "block" ? "内容" : "件名";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setTarget(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="予定を直す"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{target.title ?? "予定あり"}</p>
            <p className="text-xs text-neutral-500">
              {KIND_LABEL[target.kind]}
              {target.who && `・${target.who} さん`}・{formatDateLabel(target.date)} {timeRangeText({ startMinutes: target.start, endMinutes: target.end })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTarget(null)}
            aria-label="閉じる"
            className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100"
          >
            ×
          </button>
        </div>

        {readOnly || !action ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {readOnly}
            {target.kind === "google" && target.readOnlyReason && (
              <>
                {" "}
                <Link href="/account" className="underline">
                  アカウント情報へ
                </Link>
              </>
            )}
          </p>
        ) : (
          <>
            {target.lockedReason ? (
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {target.lockedReason}
              </p>
            ) : (
              <form action={action.update} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={target.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">日付</span>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={target.date}
                    className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <TimeRangeFields
                  key={target.id}
                  defaultStart={target.start}
                  defaultEnd={target.end}
                  titleName="title"
                />
                <label className="block w-full">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">{titleLabel}</span>
                  <input
                    type="text"
                    name="title"
                    required={target.title !== null}
                    maxLength={100}
                    defaultValue={target.title ?? ""}
                    placeholder={target.title === null ? "空のままなら件名は変えません" : undefined}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </label>
                {target.kind === "event" && (
                  <label className="flex items-center gap-1.5 text-sm text-neutral-700">
                    <input type="checkbox" name="isPrivate" defaultChecked={target.isPrivate} />
                    私用（件名を隠す）
                  </label>
                )}
                <div className="flex w-full justify-end">
                  <SubmitButton
                    pendingText="保存中…"
                    className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    保存
                  </SubmitButton>
                </div>
              </form>
            )}

            <form action={action.remove} className="mt-3 border-t border-neutral-100 pt-3">
              <input type="hidden" name="id" value={target.id} />
              <input type="hidden" name="date" value={target.date} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton
                pendingText="削除中…"
                confirmText={`「${target.title ?? "予定あり"}」（${formatDateLabel(target.date)} ${timeRangeText({ startMinutes: target.start, endMinutes: target.end })}）を消しますか？${
                  target.kind === "google" ? "\nGoogle カレンダーからも消えます。" : ""
                }`}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                この予定を削除
              </SubmitButton>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
