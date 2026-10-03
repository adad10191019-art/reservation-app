"use server";

/**
 * Google カレンダー連携のつなぐ・外す・件名を出すかの切り替え。アカウント情報の画面から使う。
 *
 * 連携は人（社員名簿）に付くので、部署に属さない社員もつなげる（requireTeamSession）。
 * 名簿とひも付いていないアカウントはつなげない（どの人の予定か決められないため）。
 */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeamSession } from "./auth";
import { GOOGLE_CALENDAR_COOKIE } from "./constants";
import { buildAuthorizeUrl, isGoogleCalendarConfigured, removeGoogleConnection } from "./google-calendar";
import { clearGoogleEventCache } from "./google-calendar-cache";
import { prisma } from "./prisma";
import { getTeamViewer } from "./team";

const ACCOUNT_PATH = "/account";

function back(message?: string): never {
  redirect(message ? `${ACCOUNT_PATH}?error=${encodeURIComponent(message)}` : `${ACCOUNT_PATH}?done=1`);
}

/** ログインしている人の名簿ID。ひも付いていなければ画面に戻して知らせる */
async function requireOwnEmployeeId(): Promise<string> {
  const session = await requireTeamSession();
  const { employeeId } = await getTeamViewer(session);
  if (!employeeId) {
    back("このアカウントは社員名簿とひも付いていないため、Googleカレンダーをつなげません。全社管理者に依頼してください");
  }
  return employeeId;
}

/** 予定が変わったときに見直す画面 */
function revalidateAll() {
  revalidatePath(ACCOUNT_PATH);
  revalidatePath("/team");
  revalidatePath("/my-schedule");
  revalidatePath("/calendar");
  revalidatePath("/booking");
}

/**
 * Googleの許可画面へ送り出す。
 * 戻ってきたときに「自分が始めた手続きか」を確かめるため、合言葉をCookieに入れておく。
 */
export async function connectGoogleCalendar() {
  const employeeId = await requireOwnEmployeeId();
  if (!isGoogleCalendarConfigured()) back("Googleカレンダー連携がまだ準備できていません");

  const nonce = randomBytes(16).toString("base64url");
  const store = await cookies();
  store.set(GOOGLE_CALENDAR_COOKIE, JSON.stringify({ nonce, employeeId }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10分で切れる
  });

  redirect(buildAuthorizeUrl(nonce));
}

/** 連携を外す。Google 側にも、以後このアプリに読ませないよう伝える */
export async function disconnectGoogleCalendar() {
  const employeeId = await requireOwnEmployeeId();

  await removeGoogleConnection(employeeId);

  revalidateAll();
  back();
}

/** 全体スケジュールに件名を出すか（出さないときは「予定あり」だけ） */
export async function setGoogleShowTitles(formData: FormData) {
  const employeeId = await requireOwnEmployeeId();
  const showTitles = formData.get("showTitles") === "1";

  await prisma.googleCalendarConnection.updateMany({ where: { employeeId }, data: { showTitles } });
  // 前の設定で覚えておいた分（件名あり／なし）を捨てて、次に開いたときに取り直す
  await clearGoogleEventCache(employeeId);

  revalidateAll();
  back();
}
