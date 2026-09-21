/**
 * パスワードの保存と照合。
 *
 * パスワードは元に戻せない形（ハッシュ）にして保存する。
 * 万一DBが漏れても、そこから元のパスワードは取り出せない。
 *
 * Node に最初から入っている scrypt を使う。
 * 外部ライブラリを足さずに済み、公開先を選ばない。
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * 保存する形： scrypt$ソルト$ハッシュ
 *
 * ソルト（毎回変わるランダムな値）を混ぜるので、
 * 同じパスワードでも保存される値は毎回違う。
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltBase64, keyBase64] = stored.split("$");
  if (algorithm !== "scrypt" || !saltBase64 || !keyBase64) return false;

  const salt = Buffer.from(saltBase64, "base64");
  const expected = Buffer.from(keyBase64, "base64");
  if (expected.length === 0) return false;

  const actual = await scrypt(password, salt, expected.length);

  // 単純な === で比べると、一致した文字数で処理時間が変わり、
  // そこからパスワードを推測される余地が生まれる。
  // timingSafeEqual は長さが同じなら常に同じ時間で比べる。
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
