/**
 * お客様向けURLに使う短い名前（slug）の検査。
 *
 * `/book/<長いID>` は読みにくく、案内文や名刺に載せづらい。
 * `/book/sample-salon` のように短い名前を付けられるようにする。
 *
 * DBを触らない純粋な処理。そのままテストできる。
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/** URLとして使えない文字が入っていないか、紛らわしくないかを見る */
export function validateSlug(input: string): { ok: true; slug: string } | { ok: false; message: string } {
  const slug = input.trim().toLowerCase();

  if (slug === "") return { ok: false, message: "短い名前を入力してください" };
  if (slug.length < SLUG_MIN) {
    return { ok: false, message: `短い名前は${SLUG_MIN}文字以上にしてください` };
  }
  if (slug.length > SLUG_MAX) {
    return { ok: false, message: `短い名前は${SLUG_MAX}文字以内にしてください` };
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, message: "半角の英小文字・数字・ハイフンだけが使えます" };
  }
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return { ok: false, message: "ハイフンで始めたり終えたりはできません" };
  }
  if (slug.includes("--")) {
    return { ok: false, message: "ハイフンを続けて使うことはできません" };
  }
  // 店舗IDと見分けがつかなくなるのを防ぐ
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(slug)) {
    return { ok: false, message: "店舗IDのような形式は使えません" };
  }

  return { ok: true, slug };
}

/** 店舗名から、そのまま使える候補を作る（英数字がなければ空） */
export function suggestSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
  return validateSlug(slug).ok ? slug : "";
}
