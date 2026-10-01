/**
 * 予約に関する通知（LINE・メール）。
 *
 * お客様へは、LINEに紐づいていればLINEで、そうでなくメールアドレスがあれば
 * メールで送る（メールアドレスはメールの確認コードでログインした人だけが持つ）。
 * 両方あってもLINEだけに送り、同じ知らせが2通届かないようにする。
 *
 * 通知は「できたら送る」もの。送れなくても予約は成立させたいので、
 * ここでは例外を投げず、結果を返すだけにする。
 */
import { sendNotificationEmail } from "./email";
import { pushTextMessage, type PushResult } from "./line-messaging";
import {
  type ReservationSummary,
  reservationCanceledSubject,
  reservationCanceledText,
  reservationCreatedSubject,
  reservationCreatedText,
  reservationReminderSubject,
  reservationReminderText,
  staffCanceledSubject,
  staffCanceledText,
  staffNewReservationSubject,
  staffNewReservationText,
  withSendOnlyNotice,
} from "./notify-text";
import { prisma } from "./prisma";
import { tenantHandle } from "./tenant";

/** お客様への送り先。LINEを優先し、無ければメール */
type CustomerChannel = { kind: "line"; to: string } | { kind: "email"; to: string };

function customerChannel(customer: {
  lineUserId: string | null;
  email: string | null;
}): CustomerChannel | null {
  if (customer.lineUserId) return { kind: "line", to: customer.lineUserId };
  if (customer.email) return { kind: "email", to: customer.email };
  return null;
}

/** 予約1件から、文面に必要な情報と送り先を集める */
async function loadTarget(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { tenant: true, staff: true, customer: true },
  });
  if (!reservation) return null;
  const channel = customerChannel(reservation.customer);
  if (!channel) return null;

  const tenant = reservation.tenant;
  const base = process.env.APP_URL?.replace(/\/$/, "");
  const summary: ReservationSummary = {
    shopName: reservation.tenant.name,
    customerName: reservation.customer.name,
    staffName: reservation.staff.name,
    menuName: reservation.menuNameSnapshot,
    date: reservation.date,
    startMinutes: reservation.startMinutes,
    price: reservation.priceSnapshot,
    myPageUrl: base
      ? `${base}/book/${tenantHandle(reservation.tenant)}/mine`
      : undefined,
  };

  return { channel, summary, tenant };
}

type Target = NonNullable<Awaited<ReturnType<typeof loadTarget>>>;

/**
 * お客様に1通送る。メールの差出人名は店舗名にする（送信元のアドレスは自社ドメインのまま）。
 * 店舗名は送るたびにDBから読むので、設定で名前を変えれば次の通知から反映される
 */
function sendToCustomer(
  target: Target,
  build: (summary: ReservationSummary) => string,
  buildSubject: (summary: ReservationSummary) => string,
): Promise<PushResult> {
  const text = build(target.summary);
  if (target.channel.kind === "line") {
    return pushTextMessage({ tenant: target.tenant, to: target.channel.to, text });
  }
  return sendNotificationEmail({
    to: target.channel.to,
    subject: buildSubject(target.summary),
    text: withSendOnlyNotice(text, target.summary.shopName),
    fromName: target.summary.shopName,
  });
}

const NO_CHANNEL = { ok: true, sent: false, reason: "LINEにもメールにも紐づいていないお客様です" } as const;

export async function notifyReservationCreated(
  reservationId: string,
): Promise<PushResult> {
  const target = await loadTarget(reservationId);
  if (!target) return NO_CHANNEL;

  return sendToCustomer(target, reservationCreatedText, reservationCreatedSubject);
}

export async function notifyReservationCanceled(
  reservationId: string,
): Promise<PushResult> {
  const target = await loadTarget(reservationId);
  if (!target) return NO_CHANNEL;

  return sendToCustomer(target, reservationCanceledText, reservationCanceledSubject);
}

export type ReminderOutcome = {
  reservationId: string;
  customerName: string;
  sent: boolean;
  reason?: string;
};

/**
 * 指定日のリマインドを送る。
 *
 * すでに送った予約は飛ばす。送信に失敗したものは「送信済み」にしないので、
 * 次の実行でもう一度試される。
 *
 * 定時実行（Vercel Cron）は同じ回を二重に呼ぶことがあるため、
 * 送る前に「送信済み」の印を取り合う。印を付けられた実行だけが送り、
 * 送れなかったら印を外して次回に回す。
 */
export async function sendRemindersFor(date: string): Promise<ReminderOutcome[]> {
  const reservations = await prisma.reservation.findMany({
    where: {
      date,
      status: "booked",
      reminderSentAt: null,
      customer: { OR: [{ lineUserId: { not: null } }, { email: { not: null } }] },
    },
    include: { customer: true },
    orderBy: { startMinutes: "asc" },
  });

  const outcomes: ReminderOutcome[] = [];

  for (const reservation of reservations) {
    const target = await loadTarget(reservation.id);
    if (!target) {
      outcomes.push({
        reservationId: reservation.id,
        customerName: reservation.customer.name,
        sent: false,
        reason: "送り先がありません",
      });
      continue;
    }

    // 印がまだ付いていないときだけ付けられる。同時に走った別の実行が
    // 先に付けていれば count は 0 になるので、こちらは送らない
    const claimed = await prisma.reservation.updateMany({
      where: { id: reservation.id, tenantId: reservation.tenantId, reminderSentAt: null },
      data: { reminderSentAt: new Date() },
    });
    if (claimed.count === 0) continue;

    const result = await sendToCustomer(
      target,
      reservationReminderText,
      reservationReminderSubject,
    );

    // 送れなかったら印を外す。次回もう一度試す
    if (!(result.ok && result.sent)) {
      await prisma.reservation.updateMany({
        where: { id: reservation.id, tenantId: reservation.tenantId },
        data: { reminderSentAt: null },
      });
    }

    outcomes.push({
      reservationId: reservation.id,
      customerName: reservation.customer.name,
      sent: result.ok && result.sent,
      reason: result.reason,
    });
  }

  return outcomes;
}

// ── 店舗側への通知 ────────────────────────

/**
 * お店の人に知らせる。
 *
 * 送る相手は
 *   ・オーナー全員
 *   ・その予約の担当スタッフ本人
 * カレンダーを見に行かなくても、予約が入ったことに気づけるようにする。
 *
 * LINEを紐づけている人にはLINEで、まだの人にはログイン用のメールアドレス宛に
 * メールで送る（どちらも設定が無ければ、送らずに内容をログへ出すだけになる）。
 */
async function notifyStaff(
  reservationId: string,
  build: (summary: ReservationSummary) => string,
  buildSubject: (summary: ReservationSummary) => string,
): Promise<{ sent: number; skipped: number }> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { tenant: true, staff: true, customer: true },
  });
  if (!reservation) return { sent: 0, skipped: 0 };

  const recipients = await prisma.user.findMany({
    where: {
      tenantId: reservation.tenantId,
      OR: [{ role: "owner" }, { staffId: reservation.staffId }],
    },
  });

  const summary: ReservationSummary = {
    shopName: reservation.tenant.name,
    customerName: reservation.customer.name,
    staffName: reservation.staff.name,
    menuName: reservation.menuNameSnapshot,
    date: reservation.date,
    startMinutes: reservation.startMinutes,
    price: reservation.priceSnapshot,
    // 店舗側の画面はログインが要るため、URLは載せない
  };
  const text = build(summary);
  const subject = buildSubject(summary);

  let sent = 0;
  let skipped = 0;
  for (const user of recipients) {
    const result = user.lineUserId
      ? await pushTextMessage({ tenant: reservation.tenant, to: user.lineUserId, text })
      : await sendNotificationEmail({ to: user.email, subject, text });
    if (result.ok && result.sent) sent++;
    else skipped++;
  }
  return { sent, skipped };
}

export function notifyStaffNewReservation(reservationId: string) {
  return notifyStaff(reservationId, staffNewReservationText, staffNewReservationSubject);
}

export function notifyStaffCanceled(reservationId: string) {
  return notifyStaff(reservationId, staffCanceledText, staffCanceledSubject);
}
