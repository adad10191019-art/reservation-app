"use server";

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { bookAsCustomer, cancelOwnReservation } from "./booking";
import {
  buildCustomerSession,
  endCustomerSession,
  startCustomerSession,
} from "./customer-session";
import { buildAuthorizeUrl, isDevFallbackAllowed, isLineConfigured } from "./line";
import { LINE_LOGIN_COOKIE } from "./constants";
import { getActiveCustomer, upsertLineCustomer } from "./customer-store";
import { prisma } from "./prisma";
import { sanitizeDate } from "./time";

function bookPath(tenantId: string, query?: Record<string, string>): string {
  const q = new URLSearchParams(query ?? {});
  const suffix = q.toString();
  return `/book/${tenantId}${suffix ? `?${suffix}` : ""}`;
}

// ── ログイン ──────────────────────────────

/**
 * LINEの許可画面へ送り出す。
 *
 * 戻ってきたときに「自分が始めた手続きか」を確かめるため、
 * 合言葉（nonce）を作って Cookie と URL の両方に入れておく。
 */
export async function startLineLogin(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const next = String(formData.get("next") ?? "");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/");

  if (!isLineConfigured()) {
    redirect(bookPath(tenantId, { error: "LINEログインの設定がまだです" }));
  }

  const nonce = randomBytes(16).toString("base64url");
  const store = await cookies();
  store.set(LINE_LOGIN_COOKIE, JSON.stringify({ nonce, tenantId, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10分で切れる
  });

  redirect(buildAuthorizeUrl({ state: nonce }));
}

/**
 * 開発用の仮ログイン。
 * LINEの認証情報が無いときだけ使える。本番では動かない。
 */
export async function devLogin(formData: FormData) {
  if (!isDevFallbackAllowed()) redirect("/");

  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const next = String(formData.get("next") ?? "");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/");
  if (!name) redirect(bookPath(tenantId, { error: "お名前を入力してください" }));

  // 実際のLINEの利用者IDと混ざらないよう、印を付けておく
  const customer = await upsertLineCustomer({
    tenantId,
    lineUserId: `dev:${name}`,
    displayName: name,
  });

  await startCustomerSession(
    buildCustomerSession({ customerId: customer.id, tenantId, name: customer.name }),
  );
  redirect(next || bookPath(tenantId));
}

export async function customerLogout(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  await endCustomerSession();
  redirect(bookPath(tenantId));
}

// ── 予約する ──────────────────────────────

export async function createCustomerReservation(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const date = sanitizeDate(String(formData.get("date") ?? ""));
  const menuId = String(formData.get("menuId") ?? "");
  const slot = String(formData.get("slot") ?? ""); // "開始分|スタッフID"

  const back: (message: string) => never = (message) =>
    redirect(bookPath(tenantId, { date, menuId, error: message }));

  const session = await getActiveCustomer(tenantId);
  if (!session) back("ログインし直してください");

  if (!slot) back("時間を選んでください");
  const [startText, staffId] = slot.split("|");
  const startMinutes = Number(startText);
  if (!Number.isInteger(startMinutes) || !staffId) back("時間の指定が正しくありません");

  const result = await bookAsCustomer({
    tenantId,
    customerId: session.customerId,
    date,
    menuId,
    staffId,
    startMinutes,
  });

  if (!result.ok) back(result.message);

  revalidatePath("/calendar");
  redirect(`/book/${tenantId}/mine?done=1`);
}

export async function cancelCustomerReservation(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const reservationId = String(formData.get("reservationId") ?? "");

  const session = await getActiveCustomer(tenantId);
  if (!session) {
    redirect(bookPath(tenantId, { error: "ログインし直してください" }));
  }

  const result = await cancelOwnReservation({
    tenantId,
    customerId: session.customerId,
    reservationId,
  });

  revalidatePath("/calendar");
  if (!result.ok) {
    redirect(`/book/${tenantId}/mine?error=${encodeURIComponent(result.message)}`);
  }
  redirect(`/book/${tenantId}/mine?canceled=1`);
}
