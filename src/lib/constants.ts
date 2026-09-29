/**
 * 画面とサーバー処理の両方から使う定数。
 *
 * "use server" を付けたファイルは非同期関数しか公開できないため、
 * 定数はこちらに置く。
 */

/** 予約枠の刻みとして選べる値（分） */
export const SLOT_CHOICES = [5, 10, 15, 20, 30, 60] as const;

/** LINEログインの手続き中に使う一時的な Cookie 名 */
export const LINE_LOGIN_COOKIE = "line_login";

/** Googleカレンダー連携の手続き中に使う一時的な Cookie 名 */
export const GOOGLE_CALENDAR_COOKIE = "google_calendar_connect";

/** お客様のメールログイン（コード確認待ち）の間だけ使う一時的な Cookie 名 */
export const EMAIL_LOGIN_COOKIE = "email_login_pending";
