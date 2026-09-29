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
 */
import { revalidatePath } from "next/cache";
import { rescheduleReservation } from "./booking";
import { requireSession } from "./auth";

export type DragMoveResult = { ok: true } | { ok: false; message: string };

export async function moveReservationByDrag(params: {
  reservationId: string;
  date: string;
  startMinutes: number;
  staffId: string;
}): Promise<DragMoveResult> {
  const session = await requireSession();

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
  return { ok: true };
}
