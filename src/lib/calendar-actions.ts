"use server";

/**
 * カレンダー画面上のドラッグ操作から予約を動かす。
 *
 * `/reservations/[id]` の変更フォーム（moveReservation, actions.ts）と違い、
 * 別画面へ遷移させたくないので redirect しない。成功・失敗を
 * そのまま返し、呼び出し側（クライアント部品）が画面上で処理する。
 *
 * こちらの都合（担当の割り振り直しなど）で動かすことが多いため、
 * お客様への通知は送らない（rescheduleReservation 自体が通知を送らない）。
 * その代わり、あとで誰でも確認できるよう変更履歴には残す。
 */
import { revalidatePath } from "next/cache";
import { rescheduleReservation } from "./booking";
import { requireSession } from "./auth";
import { logChange } from "./change-log";
import { prisma } from "./prisma";
import { formatDateLabel, toHm } from "./time";

export type DragMoveResult = { ok: true } | { ok: false; message: string };

export async function moveReservationByDrag(params: {
  reservationId: string;
  date: string;
  startMinutes: number;
  staffId: string;
}): Promise<DragMoveResult> {
  const session = await requireSession();

  // 履歴に残すため、動かす前の状態を先に控えておく
  const before = await prisma.reservation.findFirst({
    where: { id: params.reservationId, tenantId: session.tenantId },
    include: { staff: true, customer: true },
  });

  const result = await rescheduleReservation({
    actor: session,
    tenantId: session.tenantId,
    reservationId: params.reservationId,
    date: params.date,
    staffId: params.staffId,
    startMinutes: params.startMinutes,
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath("/calendar");
  revalidatePath("/calendar/week");

  if (before) {
    const staffChanged = before.staffId !== params.staffId;
    const newStaffName = staffChanged
      ? (await prisma.staff.findUnique({ where: { id: params.staffId } }))?.name ?? "不明"
      : before.staff.name;

    const fromText = `${formatDateLabel(before.date)} ${toHm(before.startMinutes)}（${before.staff.name}）`;
    const toText = `${formatDateLabel(params.date)} ${toHm(params.startMinutes)}（${newStaffName}）`;

    await logChange({
      tenantId: session.tenantId,
      actorName: session.name,
      entity: "reservation",
      action: "moved",
      summary: `${before.menuNameSnapshot}（${before.customer.name} 様）を ${fromText} → ${toText} に移動`,
    });
  }

  return { ok: true };
}
