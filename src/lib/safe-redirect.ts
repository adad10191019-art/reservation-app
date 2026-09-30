/**
 * ログイン後の戻り先（next）の確認。
 *
 * next はフォームやCookieを通って戻ってくる値なので、書き換えられうる。
 * そのまま使うと「このサイトでログインしたのに、外部の偽サイトへ飛ばされる」
 * 攻撃（オープンリダイレクト）の入口になる。
 * このサイト内のパス（"/" で始まる）だけを通し、それ以外は既定の戻り先にする。
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/")) return fallback;
  // "//evil.com" や "/\evil.com" は、ブラウザが外部のサイトとして扱う
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
