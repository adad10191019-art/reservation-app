/**
 * LINEの許可画面から戻ってくる先。
 *
 * 1. 合言葉（state）が、こちらで発行したものと一致するか確かめる
 * 2. 認可コードを使って利用者の情報を受け取る
 * 3. お客様を特定（いなければ作る）して、ログイン状態にする
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildCustomerSession, encodeCustomerSession, CUSTOMER_COOKIE, CUSTOMER_MAX_AGE_SECONDS } from "@/lib/customer-session";
import { getVerifiedSession } from "@/lib/auth";
import { LINE_LOGIN_COOKIE } from "@/lib/constants";
import { upsertLineCustomer } from "@/lib/customer-store";
import { fetchLineProfile } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { handleOf, tenantHandle } from "@/lib/tenant";

async function errorRedirect(request: Request, tenantId: string | null, message: string) {
  const path = tenantId ? `/book/${await handleOf(tenantId)}` : "/";
  const url = new URL(path, process.env.APP_URL ?? request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const raw = store.get(LINE_LOGIN_COOKIE)?.value;
  store.delete(LINE_LOGIN_COOKIE);

  let pending: {
    nonce?: string;
    tenantId?: string;
    next?: string;
    /** "staff" ならお店の人の通知先の紐づけ。既定はお客様のログイン */
    purpose?: string;
    userId?: string;
  } = {};
  try {
    pending = raw ? JSON.parse(raw) : {};
  } catch {
    pending = {};
  }

  const tenantId = pending.tenantId ?? null;

  // 合言葉が合わなければ、こちらが始めた手続きではない
  if (!code || !state || !pending.nonce || state !== pending.nonce) {
    return await errorRedirect(request, tenantId, "手続きをやり直してください");
  }
  if (!tenantId) return await errorRedirect(request, null, "店舗が分かりませんでした");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return await errorRedirect(request, null, "店舗が見つかりません");

  let profile;
  try {
    profile = await fetchLineProfile(code);
  } catch (e) {
    return await errorRedirect(
      request,
      tenantId,
      e instanceof Error ? e.message : "LINEとのやり取りに失敗しました",
    );
  }

  // お店の人が「通知を受け取るLINE」を紐づける場合
  if (pending.purpose === "staff") {
    const session = await getVerifiedSession();
    if (!session || session.tenantId !== tenantId || session.userId !== pending.userId) {
      return await errorRedirect(request, tenantId, "ログインし直してから、もう一度お試しください");
    }

    // 同じ店舗で同じLINEを二重に紐づけない（ほかのアカウントが使っていないか）
    const taken = await prisma.user.findFirst({
      where: { tenantId, lineUserId: profile.userId, NOT: { id: session.userId } },
      select: { id: true },
    });

    const destination = new URL(
      pending.next || "/notify",
      process.env.APP_URL ?? request.url,
    );
    if (taken) {
      destination.searchParams.set(
        "error",
        "そのLINEアカウントは、すでに別のアカウントに紐づいています",
      );
      return NextResponse.redirect(destination);
    }

    await prisma.user.updateMany({
      where: { id: session.userId, tenantId },
      data: { lineUserId: profile.userId },
    });

    destination.searchParams.set("done", "1");
    return NextResponse.redirect(destination);
  }

  const customer = await upsertLineCustomer({
    tenantId,
    lineUserId: profile.userId,
    displayName: profile.displayName,
  });

  const session = buildCustomerSession({
    customerId: customer.id,
    tenantId,
    name: customer.name,
  });

  const destination = new URL(
    pending.next || `/book/${tenantHandle(tenant)}`,
    process.env.APP_URL ?? request.url,
  );
  const response = NextResponse.redirect(destination);
  response.cookies.set(CUSTOMER_COOKIE, encodeCustomerSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CUSTOMER_MAX_AGE_SECONDS,
  });
  return response;
}
