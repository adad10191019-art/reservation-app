/**
 * Googleの許可画面から戻ってくる先。
 *
 * 1. 合言葉（state）が、こちらで発行したものと一致するか確かめる
 * 2. 今ログインしている本人（名簿の人）からの手続きであることを確かめる
 * 3. 認可コードをリフレッシュトークン等と交換して、その人の連携として保存する
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireTeamSession } from "@/lib/auth";
import { GOOGLE_CALENDAR_COOKIE } from "@/lib/constants";
import { exchangeCodeForTokens } from "@/lib/google-calendar";
import { clearGoogleEventCache } from "@/lib/google-calendar-cache";
import { prisma } from "@/lib/prisma";
import { getTeamViewer } from "@/lib/team";

const ACCOUNT_PATH = "/account";

function finish(request: Request, error?: string) {
  const url = new URL(ACCOUNT_PATH, process.env.APP_URL ?? request.url);
  if (error) url.searchParams.set("error", error);
  else url.searchParams.set("done", "1");
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const raw = store.get(GOOGLE_CALENDAR_COOKIE)?.value;
  store.delete(GOOGLE_CALENDAR_COOKIE);

  let pending: { nonce?: string; employeeId?: string } = {};
  try {
    pending = raw ? JSON.parse(raw) : {};
  } catch {
    pending = {};
  }

  if (!code || !state || !pending.nonce || state !== pending.nonce || !pending.employeeId) {
    return finish(request, "手続きをやり直してください");
  }

  const session = await requireTeamSession();
  const { employeeId } = await getTeamViewer(session);
  if (!employeeId || employeeId !== pending.employeeId) {
    return finish(request, "ログインし直してから、もう一度お試しください");
  }

  try {
    const { refreshToken, email: googleEmail, accessToken, expiresIn } =
      await exchangeCodeForTokens(code);
    const accessTokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await prisma.googleCalendarConnection.upsert({
      where: { employeeId },
      create: { employeeId, googleEmail, refreshToken, accessToken, accessTokenExpiresAt },
      update: { googleEmail, refreshToken, accessToken, accessTokenExpiresAt },
    });
    // 別の Google アカウントでつなぎ直したときに、前のアカウントの予定を出さないように
    await clearGoogleEventCache(employeeId);
  } catch (e) {
    return finish(request, e instanceof Error ? e.message : "Googleとのやり取りに失敗しました");
  }

  return finish(request);
}
