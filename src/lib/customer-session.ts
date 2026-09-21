/**
 * お客様のログイン状態。
 *
 * 店舗側（オーナー・スタッフ）とは別の Cookie で持つ。
 * 混ぜると、片方のログインでもう片方の画面に入れてしまう。
 *
 * 署名の仕組みは店舗側と同じ（session.ts）を使う。
 */
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export type CustomerSessionData = {
  customerId: string;
  tenantId: string;
  name: string;
  exp: number;
};

export const CUSTOMER_COOKIE = "customer_session";
export const CUSTOMER_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30日

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET が設定されていません（16文字以上）");
  }
  // 店舗側の署名と使い回さないよう、用途を混ぜてから鍵にする
  return `customer:${secret}`;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeCustomerSession(
  data: CustomerSessionData,
  secret = getSecret(),
): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeCustomerSession(
  token: string | undefined,
  secret = getSecret(),
  now = Date.now(),
): CustomerSessionData | null {
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
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as CustomerSessionData;
    if (typeof data.exp !== "number" || data.exp <= now) return null;
    if (!data.customerId || !data.tenantId) return null;
    return data;
  } catch {
    return null;
  }
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
  store.set(CUSTOMER_COOKIE, encodeCustomerSession(data), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CUSTOMER_MAX_AGE_SECONDS,
  });
}

export async function endCustomerSession(): Promise<void> {
  const store = await cookies();
  store.delete(CUSTOMER_COOKIE);
}
