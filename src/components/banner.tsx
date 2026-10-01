/**
 * 設定画面で使う、結果の表示。
 * notice は「保存はできたが、知っておいてほしいこと・続けてやってほしいこと」の案内。
 */
export function Banner({
  error,
  done,
  notice,
}: {
  error?: string;
  done?: string;
  notice?: string;
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
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          保存しました。
        </p>
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
