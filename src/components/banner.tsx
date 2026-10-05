import type { ReactNode } from "react";

/**
 * 設定画面で使う、結果の表示。
 * notice は「保存はできたが、知っておいてほしいこと・続けてやってほしいこと」の案内。
 */
export function Banner({
  error,
  done,
  notice,
  doneText = "保存しました。",
  doneAction,
}: {
  error?: string;
  done?: string;
  notice?: string;
  /** 「保存しました。」の代わりに出す文 */
  doneText?: string;
  /** 「保存しました」の横に置くボタン（今足した予定の「取り消す」など） */
  doneAction?: ReactNode;
}) {
  if (error) {
    return (
      <p
        role="alert"
        className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      >
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>{doneText}</p>
          {doneAction}
        </div>
        {notice && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
            {notice}
          </p>
        )}
      </div>
    );
  }
  return null;
}
