/**
 * 予約に関するLINE通知。
 *
 * 通知は「できたら送る」もの。送れなくても予約は成立させたいので、
 * ここでは例外を投げず、結果を返すだけにする。
 */
import { pushTextMessage, type PushResult } from "./line-messaging";
import {
  type ReservationSummary,
  reservationCanceledText,
  reservationCreatedText,
  reservationReminderText,
} from "./notify-text";
import { prisma } from "./prisma";
import { tenantHandle } from "./tenant";

/** 予約1件から、文面に必要な情報と送り先を集める */
async function loadTarget(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { tenant: true, staff: true, customer: true },
  });
  if (!reservation) return null;
  if (!reservation.customer.lineUserId) return null;

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

  return { to: reservation.customer.lineUserId, summary };
}

export async function notifyReservationCreated(
  reservationId: string,
): Promise<PushResult> {
  const target = await loadTarget(reservationId);
  if (!target) return { ok: true, sent: false, reason: "LINEに紐づいていないお客様です" };

  return pushTextMessage({
    to: target.to,
    text: reservationCreatedText(target.summary),
  });
}

export async function notifyReservationCanceled(
  reservationId: string,
): Promise<PushResult> {
  const target = await loadTarget(reservationId);
  if (!target) return { ok: true, sent: false, reason: "LINEに紐づいていないお客様です" };

  return pushTextMessage({
    to: target.to,
    text: reservationCanceledText(target.summary),
  });
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
 */
export async function sendRemindersFor(date: string): Promise<ReminderOutcome[]> {
  const reservations = await prisma.reservation.findMany({
    where: {
      date,
      status: "booked",
      reminderSentAt: null,
      customer: { lineUserId: { not: null } },
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

    const result = await pushTextMessage({
      to: target.to,
      text: reservationReminderText(target.summary),
    });

    // 送れたときだけ記録する。失敗は次回もう一度試す
    if (result.ok && result.sent) {
      await prisma.reservation.updateMany({
        where: { id: reservation.id, tenantId: reservation.tenantId },
        data: { reminderSentAt: new Date() },
      });
    }

    outcomes.push({
      reservationId: reservation.id,
      customerName: reservation.customer.name,
      sent: result.ok && result.sent,
      reason: result.ok ? result.reason : result.reason,
    });
  }

  return outcomes;
}
