/**
 * お客様のログイン状態。
 *
 * 店舗側（オーナー・スタッフ）とは別の Cookie で持つ。
 * 混ぜると、片方のログインでもう片方の画面に入れてしまう。
 *
 * 署名の仕組みは店舗側と同じ（signed-token.ts）を使う。
 * ただし鍵は用途を混ぜて変えてあるので、店舗側の Cookie をお客様側に
 * 差し込んでも（その逆も）通らない。
 */
import { cookies } from "next/headers";
import { getAuthSecret, readSignedToken, signToken } from "./signed-token";

export type CustomerSessionData = {
  customerId: string;
  tenantId: string;
  name: string;
  exp: number;
};

export const CUSTOMER_COOKIE = "customer_session";
export const CUSTOMER_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30日

/** お客様のログイン Cookie の設定。ログインする経路（LINE・LIFF・メール）すべてで使う */
export const CUSTOMER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: CUSTOMER_MAX_AGE_SECONDS,
} as const;

function getSecret(): string {
  // 店舗側の署名と使い回さないよう、用途を混ぜてから鍵にする
  return `customer:${getAuthSecret()}`;
}

export function encodeCustomerSession(
  data: CustomerSessionData,
  secret = getSecret(),
): string {
  return signToken(data, secret);
}

export function decodeCustomerSession(
  token: string | undefined,
  secret = getSecret(),
  now = Date.now(),
): CustomerSessionData | null {
  const data = readSignedToken(token, secret) as Partial<CustomerSessionData> | null;
  if (!data || typeof data !== "object") return null;
  if (typeof data.exp !== "number" || data.exp <= now) return null;
  if (!data.customerId || !data.tenantId) return null;
  return data as CustomerSessionData;
}

export function buildCustomerSession(
  data: { customerId: string; tenantId: string; name: string },
  now = Date.now(),
): CustomerSessionData {
  return { ...data, exp: now + CUSTOMER_MAX_AGE_SECONDS * 1000 };
}

// ── Cookie の読み書き ─────────────────────

export async function getCustomerSession(): Promise<CustomerSessionData | null> {
  const store = await cookies();
  return decodeCustomerSession(store.get(CUSTOMER_COOKIE)?.value);
}

export async function startCustomerSession(data: CustomerSessionData): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, encodeCustomerSession(data), CUSTOMER_COOKIE_OPTIONS);
}

export async function endCustomerSession(): Promise<void> {
  const store = await cookies();
  store.delete(CUSTOMER_COOKIE);
}
