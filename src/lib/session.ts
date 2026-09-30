/**
 * ログイン状態の保持。
 *
 * ログインした人の情報を Cookie に入れて持ち回る。
 * ただし中身をそのまま入れると書き換えられてしまうので、
 * サーバーの秘密鍵で署名を付け、改ざんされていないかを毎回確かめる。
 *
 * 署名の仕組みは signed-token.ts にある（お客様側と共通）。
 * DBもCookieも触らない純粋な処理なので、そのままテストできる。
 */
import { getAuthSecret, readSignedToken, signToken } from "./signed-token";

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

export function encodeSession(data: SessionData, secret = getAuthSecret()): string {
  return signToken(data, secret);
}

/**
 * 署名が正しく、期限も切れていなければ中身を返す。
 * 少しでもおかしければ null を返す（理由は伝えない）。
 */
export function decodeSession(
  token: string | undefined,
  secret = getAuthSecret(),
  now = Date.now(),
): SessionData | null {
  const data = readSignedToken(token, secret) as Partial<SessionData> | null;
  if (!data || typeof data !== "object") return null;
  if (typeof data.exp !== "number" || data.exp <= now) return null;
  if (!data.userId || !data.tenantId) return null;
  if (data.role !== "owner" && data.role !== "staff" && data.role !== "group_admin") {
    return null;
  }
  return data as SessionData;
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
