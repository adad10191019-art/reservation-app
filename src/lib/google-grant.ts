/**
 * Google の連携が「切れた」かどうかの判定（google-calendar.ts から使う）。
 * DBもCookieも触らない純粋な処理なので、そのままテストできる。
 *
 * 切れたと見なすのは、トークンの取り直しに Google が invalid_grant を返したときだけ
 * （本人が許可を取り消した・テスト中のアプリで7日たった・パスワードを変えた など）。
 * 通信の失敗や Google 側の一時的な不調では切れたことにしない（勝手に止めないため）。
 */

/** トークンの取り直しへの応答が「この許可はもう使えない」か */
export function isRevokedGrantResponse(status: number, body: unknown): boolean {
  if (status !== 400) return false;
  if (typeof body !== "object" || body === null) return false;
  return (body as { error?: unknown }).error === "invalid_grant";
}

/** 連携が切れていて、つなぎ直すまで使えないことを表す */
export class GoogleGrantRevokedError extends Error {
  constructor() {
    super("Googleカレンダーとの連携が切れています。つなぎ直してください");
  }
}
