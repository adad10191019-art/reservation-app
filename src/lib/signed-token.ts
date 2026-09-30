/**
 * 署名付きの値（Cookie に入れて持ち回る）の作成と照合。
 *
 * 中身をそのまま Cookie に入れると書き換えられてしまうので、
 * サーバーの秘密鍵で署名を付け、改ざんされていないかを毎回確かめる。
 * 店舗側（session.ts）とお客様側（customer-session.ts）で共通に使う。
 *
 * DBもCookieも触らない純粋な処理なので、そのままテストできる。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** 値を JSON にして署名を付け、「中身.署名」の形にする */
export function signToken(data: unknown, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * 署名が正しければ中身を返す。少しでもおかしければ null を返す（理由は伝えない）。
 * 中身の項目が揃っているか・期限が切れていないかは、呼び出し側で確かめる。
 */
export function readSignedToken(token: string | undefined, secret: string): unknown {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  // 単純な === で比べると、一致した文字数で処理時間が変わり、署名を推測される余地が生まれる
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}

/** 秘密鍵（AUTH_SECRET）を読む。未設定・短すぎるときは例外にする */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET が設定されていません（16文字以上）。.env.example を参照してください",
    );
  }
  return secret;
}
