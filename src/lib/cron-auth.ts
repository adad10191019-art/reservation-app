/**
 * 定時実行（Vercel Cron）からの呼び出しかを確かめる。
 *
 * Vercel は、環境変数 CRON_SECRET の値を
 * 「Authorization: Bearer <CRON_SECRET>」として付けて呼んでくる。
 * URL を知っているだけの人が叩いても、リマインドを送らせないようにする。
 *
 * DBもCookieも触らない純粋な判定なので、そのままテストできる。
 */
import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  secret: string | undefined,
): boolean {
  // 秘密の値が未設定なら、誰からの呼び出しも受け付けない
  if (!secret || secret.length < 16) return false;
  if (!authorizationHeader) return false;

  const actual = Buffer.from(authorizationHeader);
  const expected = Buffer.from(`Bearer ${secret}`);
  // 一致した文字数で処理時間が変わらないよう、timingSafeEqual で比べる
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
