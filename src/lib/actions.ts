"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endSession, requireSession, startSession } from "./auth";
import {
  type ReservationStatus,
  bookReservation,
  rescheduleReservation,
  setReservationStatus,
} from "./booking";
import { verifyPassword } from "./password";
import { prisma } from "./prisma";
import { buildSession, type Role } from "./session";
import { sanitizeDate } from "./time";

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/booking");
}

// ── ログイン・ログアウト ──────────────────

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // 日本語をそのままURLに入れると Location ヘッダーに載せられない
  const fail = () =>
    redirect(`/login?error=${encodeURIComponent("メールアドレスまたはパスワードが違います")}`);

  if (!email || !password) fail();

  // メールアドレスは店舗ごとに一意なので、同じアドレスが別店舗に
  // 存在しうる。ここではパスワードまで一致した最初のアカウントを使う。
  const candidates = await prisma.user.findMany({
    where: { email },
    include: { staff: true, tenant: true },
  });

  for (const user of candidates) {
    if (await verifyPassword(password, user.passwordHash)) {
      await startSession(
        buildSession({
          userId: user.id,
          tenantId: user.tenantId,
          role: user.role as Role,
          staffId: user.staffId,
          name: user.staff?.name ?? user.email,
        }),
      );
      redirect("/calendar");
    }
  }

  // 「アドレスが無い」と「パスワードが違う」を区別しない。
  // 区別すると、どのアドレスが登録済みかを外から調べられてしまう。
  fail();
}

export async function logout() {
  await endSession();
  redirect("/login");
}

// ── 新規登録 ──────────────────────────────

/** 失敗時は /booking に理由を載せて戻す */
function backToBooking(params: {
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
  const session = await requireSession();

  const date = sanitizeDate(String(formData.get("date") ?? ""));
  const menuId = String(formData.get("menuId") ?? "");
  const filterStaffId = String(formData.get("filterStaffId") ?? "");
  const slot = String(formData.get("slot") ?? ""); // "開始分|スタッフID"
  const customerId = String(formData.get("customerId") ?? "");
  const newCustomerName = String(formData.get("newCustomerName") ?? "").trim();
  const newCustomerPhone = String(formData.get("newCustomerPhone") ?? "").trim();

  const back = { date, menuId, staffId: filterStaffId || undefined };

  if (!slot) backToBooking({ ...back, message: "時間を選んでください" });

  const [startText, staffId] = slot.split("|");
  const startMinutes = Number(startText);
  if (!Number.isInteger(startMinutes) || !staffId) {
    backToBooking({ ...back, message: "時間の指定が正しくありません" });
  }

  const result = await bookReservation({
    actor: session,
    tenantId: session.tenantId,
    date,
    menuId,
    staffId,
    startMinutes,
    customerId: customerId || undefined,
    newCustomer: newCustomerName
      ? { name: newCustomerName, phone: newCustomerPhone || undefined }
      : undefined,
  });

  if (!result.ok) backToBooking({ ...back, message: result.message });

  refresh();
  redirect(`/calendar?date=${date}`);
}

// ── 状態の変更 ────────────────────────────

export async function changeReservationStatus(formData: FormData) {
  const session = await requireSession();

  const reservationId = String(formData.get("reservationId") ?? "");
  const status = String(formData.get("status") ?? "") as ReservationStatus;

  const result = await setReservationStatus({
    actor: session,
    tenantId: session.tenantId,
    reservationId,
    status,
  });

  refresh();
  if (!result.ok) {
    redirect(`/reservations/${reservationId}?error=${encodeURIComponent(result.message)}`);
  }
  redirect(`/reservations/${reservationId}?done=1`);
}

// ── 日時・担当の変更 ──────────────────────

export async function moveReservation(formData: FormData) {
  const session = await requireSession();

  const reservationId = String(formData.get("reservationId") ?? "");
  const date = sanitizeDate(String(formData.get("date") ?? ""));
  const slot = String(formData.get("slot") ?? ""); // "開始分|スタッフID"

  // 型注釈を付けておくと、呼んだ先で「ここから下は実行されない」と扱われる
  const backTo: (message: string) => never = (message) =>
    redirect(
      `/reservations/${reservationId}?date=${date}&error=${encodeURIComponent(message)}`,
    );

  if (!slot) backTo("変更先の時間を選んでください");

  const [startText, staffId] = slot.split("|");
  const startMinutes = Number(startText);
  if (!Number.isInteger(startMinutes) || !staffId) {
    backTo("時間の指定が正しくありません");
  }

  const result = await rescheduleReservation({
    actor: session,
    tenantId: session.tenantId,
    reservationId,
    date,
    staffId,
    startMinutes,
  });

  refresh();
  if (!result.ok) backTo(result.message);
  redirect(`/reservations/${reservationId}?done=1`);
}
