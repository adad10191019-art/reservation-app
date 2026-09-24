/**
 * ログイン状態の保持。
 *
 * ログインした人の情報を Cookie に入れて持ち回る。
 * ただし中身をそのまま入れると書き換えられてしまうので、
 * サーバーの秘密鍵で署名を付け、改ざんされていないかを毎回確かめる。
 *
 * 署名の作成・検証はDBもCookieも触らない純粋な処理なので、そのままテストできる。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type Role = "owner" | "staff" | "group_admin";

export type SessionData = {
  userId: string;
  /**
   * 今、操作対象として選んでいる部署のID。
   * owner/staff は自分の所属部署で固定。group_admin だけは
   * ログイン後に部署を切り替えるたびにここが書き換わる。
   */
  tenantId: string;
  role: Role;
  /** スタッフ本人のアカウントなら、そのスタッフID */
  staffId: string | null;
  name: string;
  /** 有効期限（ミリ秒） */
  exp: number;
};

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7日

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET が設定されていません（16文字以上）。.env.example を参照してください",
    );
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeSession(data: SessionData, secret = getSecret()): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * 署名が正しく、期限も切れていなければ中身を返す。
 * 少しでもおかしければ null を返す（理由は伝えない）。
 */
export function decodeSession(
  token: string | undefined,
  secret = getSecret(),
  now = Date.now(),
): SessionData | null {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(payload, secret);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionData;
    if (typeof data.exp !== "number" || data.exp <= now) return null;
    if (!data.userId || !data.tenantId) return null;
    if (data.role !== "owner" && data.role !== "staff" && data.role !== "group_admin") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** 今から有効期限までの SessionData を作る */
export function buildSession(
  user: {
    userId: string;
    tenantId: string;
    role: Role;
    staffId: string | null;
    name: string;
  },
  now = Date.now(),
): SessionData {
  return { ...user, exp: now + SESSION_MAX_AGE_SECONDS * 1000 };
}
