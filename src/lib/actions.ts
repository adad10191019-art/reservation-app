"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { bookReservation } from "./booking";
import { prisma } from "./prisma";
import { sanitizeDate } from "./time";

/** 失敗時は /booking に理由を載せて戻す */
function backWithError(params: {
  date: string;
  menuId: string;
  staffId?: string;
  message: string;
}): never {
  const q = new URLSearchParams({ date: params.date, menuId: params.menuId });
  if (params.staffId) q.set("staffId", params.staffId);
  q.set("error", params.message);
  redirect(`/booking?${q.toString()}`);
}

/**
 * 予約フォームの送信先。
 * 値の取り出しとページ遷移だけを担当し、判断は bookReservation に任せる。
 */
export async function createReservation(formData: FormData) {
  const date = sanitizeDate(String(formData.get("date") ?? ""));
  const menuId = String(formData.get("menuId") ?? "");
  const filterStaffId = String(formData.get("filterStaffId") ?? "");
  const slot = String(formData.get("slot") ?? ""); // "開始分|スタッフID"
  const customerId = String(formData.get("customerId") ?? "");
  const newCustomerName = String(formData.get("newCustomerName") ?? "").trim();
  const newCustomerPhone = String(formData.get("newCustomerPhone") ?? "").trim();

  const back = { date, menuId, staffId: filterStaffId || undefined };

  if (!slot) backWithError({ ...back, message: "時間を選んでください" });

  const [startText, staffId] = slot.split("|");
  const startMinutes = Number(startText);
  if (!Number.isInteger(startMinutes) || !staffId) {
    backWithError({ ...back, message: "時間の指定が正しくありません" });
  }

  // 認証を入れるまでの暫定。最初の店舗を使う。
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) backWithError({ ...back, message: "店舗が見つかりません" });

  const result = await bookReservation({
    tenantId: tenant.id,
    date,
    menuId,
    staffId,
    startMinutes,
    customerId: customerId || undefined,
    newCustomer: newCustomerName
      ? { name: newCustomerName, phone: newCustomerPhone || undefined }
      : undefined,
  });

  if (!result.ok) backWithError({ ...back, message: result.message });

  revalidatePath("/calendar");
  revalidatePath("/booking");
  redirect(`/calendar?date=${date}`);
}
