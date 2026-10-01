"use server";

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pickLoginTenant, resolveMemberSession } from "./account-access";
import {
  FIRST_PASSWORD_PATH,
  endSession,
  loadAccessUser,
  requireSession,
  startDeptSession,
  startSession,
} from "./auth";
import {
  type ReservationStatus,
  bookReservation,
  rescheduleReservation,
  setReservationStatus,
} from "./booking";
import { logReservationMoved } from "./change-log";
import { LINE_LOGIN_COOKIE } from "./constants";
import { buildAuthorizeUrl, isLineConfigured } from "./line";
import { isLocked, recordFailure, recordSuccess } from "./login-attempts";
import { verifyPassword } from "./password";
import { notifyReservationCanceled, notifyReservationCreated } from "./notify";
import { prisma } from "./prisma";
import { buildSession } from "./session";
import { sanitizeDate } from "./time";

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/calendar/week");
  revalidatePath("/booking");
}

// ── ログイン・ログアウト ──────────────────

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // 日本語をそのままURLに入れると Location ヘッダーに載せられない
  const fail = (): never =>
    redirect(`/login?error=${encodeURIComponent("メールアドレスまたはパスワードが違います")}`);
  const tooManyAttempts = (): never =>
    redirect(
      `/login?error=${encodeURIComponent(
        "ログイン試行が多すぎます。しばらくしてからもう一度お試しください",
      )}`,
    );

  if (!email || !password) fail();
  if (await isLocked(email)) tooManyAttempts();

  // メールアドレスはシステム全体で1つだけ（1人1アカウント）
  const user = await loadAccessUser({ email });

  // 「アドレスが無い」と「パスワードが違う」を区別しない。
  // 区別すると、どのアドレスが登録済みかを外から調べられてしまう。
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await recordFailure(email);
    fail();
    return;
  }

  // 担当部署の無い社員は「全社の1日」だけを使う。名簿で在籍を外された人は入れない
  const member = resolveMemberSession(user);
  if (member) {
    await recordSuccess(email);
    await startSession(buildSession(member));
    redirect(user.mustChangePassword ? FIRST_PASSWORD_PATH : "/team");
  }

  const tenants = user.isGroupAdmin
    ? await prisma.tenant.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } })
    : [];
  const tenantId = pickLoginTenant(user, tenants.map((t) => t.id));
  if (!tenantId || !(await startDeptSession(user, tenantId))) {
    await recordFailure(email);
    fail();
    return;
  }
  await recordSuccess(email);

  if (user.mustChangePassword) redirect(FIRST_PASSWORD_PATH);

  // スタッフは、まず自分の予定が見える画面に着地させる。
  // 全員分の予約が並ぶカレンダーは「必要なときに見る」もので、
  // 毎回そこへ着地させると自分の分を探す手間が生まれる。
  // オーナー・group_admin は全員を把握する必要があるので、これまで通りカレンダーへ。
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  redirect(membership?.role === "staff" && membership.staffId ? "/my-schedule" : "/calendar");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/** 今操作対象にしている部署を切り替える（全社管理者は全部署、兼任の人は担当部署の中で） */
export async function switchTenant(formData: FormData) {
  const session = await requireSession();
  const tenantId = String(formData.get("tenantId") ?? "");

  const user = await loadAccessUser({ id: session.userId });
  if (!user || !(await startDeptSession(user, tenantId))) {
    redirect(`/calendar?error=${encodeURIComponent("その部署には切り替えられません")}`);
  }

  redirect("/calendar");
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

  // LINEに紐づいているお客様には通知する（紐づいていなければ何もしない）
  await notifyReservationCreated(result.reservationId);

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

  if (result.ok && status === "canceled") await notifyReservationCanceled(reservationId);

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

  // 履歴に残すため、動かす前の状態を先に控えておく
  const before = await prisma.reservation.findFirst({
    where: { id: reservationId, tenantId: session.tenantId },
    include: { staff: true, customer: true },
  });

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

  if (before) {
    await logReservationMoved({
      tenantId: session.tenantId,
      actorName: session.name,
      before,
      after: { date, startMinutes, staffId },
    });
  }
  redirect(`/reservations/${reservationId}?done=1`);
}

// ── 通知を受け取るLINEの紐づけ ────────────

/**
 * お店の人が、自分のLINEで通知を受け取れるようにする。
 *
 * お客様と同じLINEログインの仕組みを使う。
 * 戻ってきたときに「誰の紐づけか」が分かるよう、Cookie に用途と本人を入れておく。
 */
export async function startStaffLineLink() {
  const session = await requireSession();
  const path = "/notify";

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) redirect(path);

  if (!isLineConfigured(tenant)) {
    redirect(`${path}?error=${encodeURIComponent("LINEログインの設定がまだです")}`);
  }

  const nonce = randomBytes(16).toString("base64url");
  const store = await cookies();
  store.set(
    LINE_LOGIN_COOKIE,
    JSON.stringify({
      nonce,
      tenantId: session.tenantId,
      next: path,
      purpose: "staff",
      userId: session.userId,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    },
  );

  redirect(buildAuthorizeUrl(tenant, { state: nonce }));
}

export async function unlinkStaffLine() {
  const session = await requireSession();

  // LINE の利用者IDは部署のLINEチャネルごとに違うので、この部署の担当分だけ外す
  await prisma.membership.updateMany({
    where: { userId: session.userId, tenantId: session.tenantId },
    data: { lineUserId: null },
  });

  revalidatePath("/notify");
  redirect("/notify?done=1");
}
