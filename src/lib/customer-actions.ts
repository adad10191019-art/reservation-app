"use server";

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { bookAsCustomer, cancelOwnReservation } from "./booking";
import { EMAIL_LOGIN_COOKIE, LINE_LOGIN_COOKIE } from "./constants";
import {
  buildCustomerSession,
  endCustomerSession,
  startCustomerSession,
} from "./customer-session";
import { getActiveCustomer, upsertEmailCustomer, upsertLineCustomer } from "./customer-store";
import { startEmailLoginCode, verifyEmailLoginCode } from "./email-login";
import { buildAuthorizeUrl, isDevFallbackAllowed, isLineConfigured } from "./line";
import {
  notifyReservationCanceled,
  notifyReservationCreated,
  notifyStaffCanceled,
  notifyStaffNewReservation,
} from "./notify";
import { prisma } from "./prisma";
import { safeNextPath } from "./safe-redirect";
import { handleOf, tenantHandle } from "./tenant";
import { sanitizeDate } from "./time";

/** お客様向けURLを組み立てる。handle は短い名前（無ければ店舗ID） */
function bookPath(handle: string, query?: Record<string, string>): string {
  const q = new URLSearchParams(query ?? {});
  const suffix = q.toString();
  return `/book/${handle}${suffix ? `?${suffix}` : ""}`;
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
  const handle = tenantHandle(tenant);

  if (!isLineConfigured(tenant)) {
    redirect(bookPath(handle, { error: "LINEログインの設定がまだです" }));
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

  redirect(buildAuthorizeUrl(tenant, { state: nonce }));
}

/**
 * 開発用の仮ログイン。
 * LINEの認証情報が無いときだけ使える。本番では動かない。
 */
export async function devLogin(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const next = String(formData.get("next") ?? "");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/");
  const handle = tenantHandle(tenant);

  if (!isDevFallbackAllowed(tenant)) redirect("/");
  if (!name) redirect(bookPath(handle, { error: "お名前を入力してください" }));

  // 実際のLINEの利用者IDと混ざらないよう、印を付けておく
  const customer = await upsertLineCustomer({
    tenantId,
    lineUserId: `dev:${name}`,
    displayName: name,
  });

  await startCustomerSession(
    buildCustomerSession({ customerId: customer.id, tenantId, name: customer.name }),
  );
  redirect(safeNextPath(next, bookPath(handle)));
}

export async function customerLogout(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  await endCustomerSession();
  redirect(bookPath(await handleOf(tenantId)));
}

// ── メールログイン ────────────────────────

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * メールアドレス宛にコードを送り、「コード入力待ち」の状態を一時Cookieに残す。
 * このCookieは本人確認そのものではなく、次の画面でどのメール宛のコードかを
 * 覚えておくためだけのもの（本人確認はコードの一致で行う）。
 */
export async function startEmailLogin(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/");
  const handle = tenantHandle(tenant);

  if (!name) redirect(bookPath(handle, { error: "お名前を入力してください" }));
  if (!EMAIL_PATTERN.test(email)) {
    redirect(bookPath(handle, { error: "メールアドレスの形式が正しくありません" }));
  }

  const result = await startEmailLoginCode({ tenantId, email });
  if (!result.ok) redirect(bookPath(handle, { error: result.message }));

  const store = await cookies();
  store.set(EMAIL_LOGIN_COOKIE, JSON.stringify({ tenantId, email, name, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10分で切れる（コードの有効期限と揃える）
  });

  redirect(bookPath(handle, { emailStep: "code" }));
}

/** 送られてきたコードを確かめ、合っていればログインさせる */
export async function verifyEmailLogin(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/");
  const handle = tenantHandle(tenant);

  const store = await cookies();
  let pending: { tenantId?: string; email?: string; name?: string; next?: string } = {};
  try {
    const raw = store.get(EMAIL_LOGIN_COOKIE)?.value;
    pending = raw ? JSON.parse(raw) : {};
  } catch {
    pending = {};
  }

  if (pending.tenantId !== tenantId || !pending.email || !pending.name) {
    store.delete(EMAIL_LOGIN_COOKIE);
    redirect(bookPath(handle, { error: "手続きをやり直してください" }));
  }
  if (!code) redirect(bookPath(handle, { emailStep: "code", error: "コードを入力してください" }));

  const result = await verifyEmailLoginCode({ tenantId, email: pending.email, code });
  if (!result.ok) {
    if (result.expired) {
      store.delete(EMAIL_LOGIN_COOKIE);
      redirect(bookPath(handle, { error: result.message }));
    }
    // コードが違うだけなら、メールアドレスから入力し直させない
    redirect(bookPath(handle, { emailStep: "code", error: result.message }));
  }

  const customer = await upsertEmailCustomer({
    tenantId,
    email: pending.email,
    name: pending.name,
  });
  store.delete(EMAIL_LOGIN_COOKIE);

  await startCustomerSession(
    buildCustomerSession({ customerId: customer.id, tenantId, name: customer.name }),
  );
  redirect(safeNextPath(pending.next, bookPath(handle)));
}

/** メールアドレスを入力し直したいときに、コード入力待ちの状態を取り消す */
export async function resetEmailLogin(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  const store = await cookies();
  store.delete(EMAIL_LOGIN_COOKIE);

  redirect(bookPath(tenant ? tenantHandle(tenant) : ""));
}

// ── 予約する ──────────────────────────────

export async function createCustomerReservation(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const date = sanitizeDate(String(formData.get("date") ?? ""));
  const menuId = String(formData.get("menuId") ?? "");
  const slot = String(formData.get("slot") ?? ""); // "開始分|スタッフID"

  const handle = await handleOf(tenantId);
  const back: (message: string) => never = (message) =>
    redirect(bookPath(handle, { date, menuId, error: message }));

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

  // 通知は送れなくても予約は成立させる
  await notifyReservationCreated(result.reservationId);
  await notifyStaffNewReservation(result.reservationId);

  revalidatePath("/calendar");
  redirect(`${bookPath(handle)}/mine?done=1`);
}

export async function cancelCustomerReservation(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const reservationId = String(formData.get("reservationId") ?? "");

  const handle = await handleOf(tenantId);

  const session = await getActiveCustomer(tenantId);
  if (!session) {
    redirect(bookPath(handle, { error: "ログインし直してください" }));
  }

  const result = await cancelOwnReservation({
    tenantId,
    customerId: session.customerId,
    reservationId,
  });

  if (result.ok) {
    await notifyReservationCanceled(reservationId);
    await notifyStaffCanceled(reservationId);
  }

  revalidatePath("/calendar");
  if (!result.ok) {
    redirect(`${bookPath(handle)}/mine?error=${encodeURIComponent(result.message)}`);
  }
  redirect(`${bookPath(handle)}/mine?canceled=1`);
}
