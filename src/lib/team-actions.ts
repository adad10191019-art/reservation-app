"use server";

/**
 * 社員の予定（EmployeeEvent）の追加・削除。「全社の1日」から使う。
 *
 * 予定は本人が自分で入れるのが基本。全社管理者だけは、他の人の分も代わりに入れ・消しできる。
 * 入れた予定は、その人がスタッフとして属する全部署の空き枠を塞ぐ（person-busy.ts）。
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeamSession } from "./auth";
import { parseRanges } from "./ranges";
import { prisma } from "./prisma";
import { getTeamViewer } from "./team";

const PATH = "/team";

function back(date: string, message?: string): never {
  const path = `${PATH}?date=${encodeURIComponent(date)}`;
  redirect(message ? `${path}&error=${encodeURIComponent(message)}` : `${path}&done=1`);
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

  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back(date, "日付の形式が正しくありません");

  // 対象の社員。指定が無ければ自分。自分以外を選べるのは全社管理者だけ
  const employeeId = String(formData.get("employeeId") ?? "") || viewer.employeeId;
  if (!employeeId) {
    back(date, "このアカウントは社員名簿とひも付いていないため、予定を入れられません。全社管理者に依頼してください");
  }
  if (employeeId !== viewer.employeeId && !viewer.isAdmin) {
    back(date, "自分の予定だけ入れられます");
  }

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, isActive: true } });
  if (!employee) back(date, "社員が見つかりません");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) back(date, "件名を入力してください");
  if (title.length > 100) back(date, "件名は100文字以内にしてください");

  const result = parseRanges(`${formData.get("start") ?? ""}-${formData.get("end") ?? ""}`);
  if (!result.ok) back(date, result.message);
  if (result.intervals.length !== 1) back(date, "開始・終了の時刻を入力してください");
  const interval = result.intervals[0];

  await prisma.employeeEvent.create({
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
  back(date);
}

export async function deleteEmployeeEvent(formData: FormData) {
  const session = await requireTeamSession();
  const viewer = await getTeamViewer(session);
  const date = String(formData.get("date") ?? "");
  const id = String(formData.get("id") ?? "");

  const event = await prisma.employeeEvent.findUnique({ where: { id } });
  if (!event) back(date, "見つかりません");
  if (event.employeeId !== viewer.employeeId && !viewer.isAdmin) {
    back(date, "他の人の予定は削除できません");
  }

  await prisma.employeeEvent.delete({ where: { id } });

  revalidateAll();
  back(date);
}
