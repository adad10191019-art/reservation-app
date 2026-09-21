/** 設定画面で使う、結果の表示 */
export function Banner({ error, done }: { error?: string; done?: string }) {
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
      <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        保存しました。
      </p>
    );
  }
  return null;
}
