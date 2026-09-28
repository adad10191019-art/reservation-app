/**
 * Googleの許可画面から戻ってくる先。
 *
 * 1. 合言葉（state）が、こちらで発行したものと一致するか確かめる
 * 2. 今ログインしているスタッフ本人からの手続きであることを確かめる
 * 3. 認可コードをリフレッシュトークン等と交換して保存する
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { GOOGLE_CALENDAR_COOKIE } from "@/lib/constants";
import { exchangeCodeForTokens } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

const SETTINGS_PATH = "/my-schedule/settings";

function errorRedirect(request: Request, date: string, message: string) {
  const url = new URL(SETTINGS_PATH, process.env.APP_URL ?? request.url);
  if (date) url.searchParams.set("date", date);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const raw = store.get(GOOGLE_CALENDAR_COOKIE)?.value;
  store.delete(GOOGLE_CALENDAR_COOKIE);

  let pending: { nonce?: string; staffId?: string; date?: string } = {};
  try {
    pending = raw ? JSON.parse(raw) : {};
  } catch {
    pending = {};
  }
  const date = pending.date ?? "";

  if (!code || !state || !pending.nonce || state !== pending.nonce || !pending.staffId) {
    return errorRedirect(request, date, "手続きをやり直してください");
  }

  const session = await requireSession();
  if (session.staffId !== pending.staffId) {
    return errorRedirect(request, date, "ログインし直してから、もう一度お試しください");
  }

  try {
    const { refreshToken, email: googleEmail, accessToken, expiresIn } =
      await exchangeCodeForTokens(code);

    await prisma.googleCalendarConnection.upsert({
      where: { staffId: session.staffId },
      create: {
        staffId: session.staffId,
        tenantId: session.tenantId,
        googleEmail,
        refreshToken,
        accessToken,
        accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      },
      update: {
        googleEmail,
        refreshToken,
        accessToken,
        accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });
  } catch (e) {
    return errorRedirect(
      request,
      date,
      e instanceof Error ? e.message : "Googleとのやり取りに失敗しました",
    );
  }

  const dest = new URL(SETTINGS_PATH, process.env.APP_URL ?? request.url);
  if (date) dest.searchParams.set("date", date);
  dest.searchParams.set("done", "1");
  return NextResponse.redirect(dest);
}
