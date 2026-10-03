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

/** 部署の画面を使う人（オーナー・スタッフ・全社管理者）のログイン状態 */
export type SessionData = {
  userId: string;
  /**
   * 今、操作対象として選んでいる部署のID。
   * 兼任の人と group_admin は、部署を切り替えるたびにここが書き換わる。
   */
  tenantId: string;
  /** その部署での役割。Cookie の値は使わず、毎回 DB の担当部署から決め直す（auth.ts） */
  role: Role;
  /** その部署でのスタッフ本人なら、そのスタッフID */
  staffId: string | null;
  name: string;
  /** 有効期限（ミリ秒） */
  exp: number;
};

/**
 * 部署に属さない社員（事務など）のログイン状態。「全体スケジュール」とアカウント情報だけを使える。
 * 部署の画面は SessionData を前提に作られているので、型を分けて
 * 社員のログインがうっかり部署の画面に渡らないようにしている（requireSession は通さない）。
 */
export type MemberSessionData = {
  userId: string;
  tenantId: null;
  role: "member";
  staffId: null;
  name: string;
  exp: number;
};

/**
 * 全社管理者が部署を選んでいないときのログイン状態（ログイン直後はこれ）。
 * 社員と同じく「全体スケジュール」とアカウント情報だけを使い、部署の画面は部署を選んでから。
 */
export type CompanySessionData = {
  userId: string;
  tenantId: null;
  role: "group_admin";
  staffId: null;
  name: string;
  exp: number;
};

/** 部署を選んでいないログイン状態（tenantId が null。部署の画面には入れない） */
export type NoDeptSession = MemberSessionData | CompanySessionData;

/** どれかのログイン状態。部署を選んでいるかは tenantId が null かどうかで見分ける */
export type AnySession = SessionData | NoDeptSession;

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7日

export function encodeSession(data: AnySession, secret = getAuthSecret()): string {
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
): AnySession | null {
  const data = readSignedToken(token, secret) as Partial<AnySession> | null;
  if (!data || typeof data !== "object") return null;
  if (typeof data.exp !== "number" || data.exp <= now) return null;
  if (!data.userId) return null;
  if (data.role === "member" || (data.role === "group_admin" && data.tenantId === null)) {
    if (data.tenantId !== null || data.staffId !== null) return null;
    return data as NoDeptSession;
  }
  if (!data.tenantId) return null;
  if (data.role !== "owner" && data.role !== "staff" && data.role !== "group_admin") {
    return null;
  }
  return data as SessionData;
}

/** 今から有効期限までのログイン状態を作る */
export function buildSession(user: Omit<SessionData, "exp">, now?: number): SessionData;
export function buildSession(user: Omit<MemberSessionData, "exp">, now?: number): MemberSessionData;
export function buildSession(user: Omit<CompanySessionData, "exp">, now?: number): CompanySessionData;
export function buildSession(
  user: Omit<SessionData, "exp"> | Omit<NoDeptSession, "exp">,
  now = Date.now(),
): AnySession {
  return { ...user, exp: now + SESSION_MAX_AGE_SECONDS * 1000 } as AnySession;
}
