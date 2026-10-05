"use server";

/**
 * 社員の予定（EmployeeEvent）の追加・変更・削除と、本人の Google の予定の変更・削除。
 * 「全体スケジュール」と「自分の予定」から使う（予定を押すと開く編集の欄、entry-editor.tsx）。
 *
 * 予定は本人が自分で入れるのが基本。全社管理者だけは、他の人の分も代わりに入れ・消しできる。
 * 入れた予定は、その人がスタッフとして属する全部署の空き枠を塞ぐ（person-busy.ts）。
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeamSession } from "./auth";
import { GoogleEditError, deleteGoogleEvent, updateGoogleEvent } from "./google-calendar";
import { clearGoogleEventCache } from "./google-calendar-cache";
import { parseRanges } from "./ranges";
import { prisma } from "./prisma";
import { safeReturnPath } from "./schedule-range";
import { getTeamViewer } from "./team";

const PATH = "/team";

/**
 * 元の表示（日・週・月、選んだ人）に戻る。returnTo はフォームの隠し欄から来る。
 * added は今足した予定。戻った画面の「保存しました」に「取り消す」を出すのに使う
 */
function back(date: string, returnTo: unknown, message?: string, added?: string): never {
  // 自分の予定の画面から直したときは、自分の予定に戻る
  const base = typeof returnTo === "string" && returnTo.startsWith("/my-schedule?") ? "/my-schedule" : PATH;
  const path = safeReturnPath(returnTo, base, date);
  if (message) redirect(`${path}&error=${encodeURIComponent(message)}`);
  redirect(added ? `${path}&done=1&added=${encodeURIComponent(added)}` : `${path}&done=1`);
}

/** 予定を変えると、ひも付いた部署の空き枠・カレンダーも変わる */
function revalidateAll() {
  revalidatePath(PATH);
  revalidatePath("/calendar");
  revalidatePath("/calendar/week");
  revalidatePath("/booking");
  revalidatePath("/my-schedule");
}

export async function createEmployeeEvent(formData: FormData) {
  const session = await requireTeamSession();
  const viewer = await getTeamViewer(session);

  const returnTo = formData.get("returnTo");
  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back("", returnTo, "日付の形式が正しくありません");

  // 対象の社員。指定が無ければ自分。自分以外を選べるのは全社管理者だけ
  const employeeId = String(formData.get("employeeId") ?? "") || viewer.employeeId;
  if (!employeeId) {
    back(date, returnTo, "このアカウントは社員名簿とひも付いていないため、予定を入れられません。全社管理者に依頼してください");
  }
  if (employeeId !== viewer.employeeId && !viewer.isAdmin) {
    back(date, returnTo, "自分の予定だけ入れられます");
  }

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, isActive: true } });
  if (!employee) back(date, returnTo, "社員が見つかりません");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) back(date, returnTo, "件名を入力してください");
  if (title.length > 100) back(date, returnTo, "件名は100文字以内にしてください");

  const result = parseRanges(`${formData.get("start") ?? ""}-${formData.get("end") ?? ""}`);
  if (!result.ok) back(date, returnTo, result.message);
  if (result.intervals.length !== 1) back(date, returnTo, "開始・終了の時刻を入力してください");
  const interval = result.intervals[0];

  const created = await prisma.employeeEvent.create({
    data: {
      employeeId,
      date,
      startMinutes: interval.start,
      endMinutes: interval.end,
      title,
      isPrivate: formData.get("isPrivate") === "on",
      createdByName: session.name,
    },
  });

  revalidateAll();
  back(date, returnTo, undefined, created.id);
}

export async function deleteEmployeeEvent(formData: FormData) {
  const session = await requireTeamSession();
  const viewer = await getTeamViewer(session);
  const returnTo = formData.get("returnTo");
  const date = String(formData.get("date") ?? "");
  const id = String(formData.get("id") ?? "");

  const event = await prisma.employeeEvent.findUnique({ where: { id } });
  if (!event) back(date, returnTo, "見つかりません");
  if (event.employeeId !== viewer.employeeId && !viewer.isAdmin) {
    back(date, returnTo, "他の人の予定は削除できません");
  }

  await prisma.employeeEvent.delete({ where: { id } });

  revalidateAll();
  back(date, returnTo);
}

/** 編集の欄から送られてきた日付・時刻・件名を読む。おかしければ画面に戻して知らせる */
function readEdit(formData: FormData, returnTo: unknown, titleRequired: boolean) {
  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back("", returnTo, "日付の形式が正しくありません");
  const title = String(formData.get("title") ?? "").trim();
  if (titleRequired && !title) back(date, returnTo, "件名を入力してください");
  if (title.length > 100) back(date, returnTo, "件名は100文字以内にしてください");
  const result = parseRanges(`${formData.get("start") ?? ""}-${formData.get("end") ?? ""}`);
  if (!result.ok) back(date, returnTo, result.message);
  if (result.intervals.length !== 1) back(date, returnTo, "開始・終了の時刻を入力してください");
  return { date, title, interval: result.intervals[0] };
}

/** 社員の予定の日時・件名・私用を直す（本人か全社管理者） */
export async function updateEmployeeEvent(formData: FormData) {
  const session = await requireTeamSession();
  const viewer = await getTeamViewer(session);
  const returnTo = formData.get("returnTo");
  const id = String(formData.get("id") ?? "");
  const { date, title, interval } = readEdit(formData, returnTo, true);

  const event = await prisma.employeeEvent.findUnique({ where: { id } });
  if (!event) back(date, returnTo, "見つかりません（すでに消えている可能性があります）");
  if (event.employeeId !== viewer.employeeId && !viewer.isAdmin) {
    back(date, returnTo, "他の人の予定は直せません");
  }

  await prisma.employeeEvent.update({
    where: { id },
    data: {
      date,
      startMinutes: interval.start,
      endMinutes: interval.end,
      title,
      isPrivate: formData.get("isPrivate") === "on",
    },
  });

  revalidateAll();
  back(date, returnTo);
}

/**
 * 本人の Google の予定を直す・消すための準備。Google の予定はその人のものだけ直せる
 * （全社管理者でも、ほかの人の Google カレンダーは触らない）。
 */
async function requireOwnGoogle(returnTo: unknown, date: string) {
  const session = await requireTeamSession();
  const { employeeId } = await getTeamViewer(session);
  if (!employeeId) back(date, returnTo, "このアカウントは社員名簿とひも付いていません");
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { employeeId } });
  if (!connection) back(date, returnTo, "Google カレンダーがつながっていません");
  return { employeeId, connection };
}

export async function updateMyGoogleEvent(formData: FormData) {
  const returnTo = formData.get("returnTo");
  const eventId = String(formData.get("id") ?? "");
  // 件名を出さない設定で取ってきた予定は件名が分からないので、空なら件名は変えない
  const { date, title, interval } = readEdit(formData, returnTo, false);
  const { employeeId, connection } = await requireOwnGoogle(returnTo, date);

  try {
    await updateGoogleEvent(connection, eventId, {
      date,
      start: interval.start,
      end: interval.end,
      title: title || null,
    });
  } catch (e) {
    back(date, returnTo, e instanceof GoogleEditError ? e.message : "Google の予定を直せませんでした");
  }
  // 全体スケジュールの控えに古い予定が残らないように
  await clearGoogleEventCache(employeeId);
  revalidateAll();
  back(date, returnTo);
}

export async function deleteMyGoogleEvent(formData: FormData) {
  const returnTo = formData.get("returnTo");
  const eventId = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  const { employeeId, connection } = await requireOwnGoogle(returnTo, date);

  try {
    await deleteGoogleEvent(connection, eventId);
  } catch (e) {
    back(date, returnTo, e instanceof GoogleEditError ? e.message : "Google の予定を消せませんでした");
  }
  await clearGoogleEventCache(employeeId);
  revalidateAll();
  back(date, returnTo);
}
