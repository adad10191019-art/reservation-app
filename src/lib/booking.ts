/**
 * 予約の登録・変更・状態変更。
 *
 * 画面から送られてきた値は一切信用せず、ここで全部確かめ直す。
 * 特に「その枠が本当に空いているか」は、書き込みと同じトランザクションの中で
 * もう一度確かめる。そうしないと、2人が同時に同じ枠を押したときに
 * 両方とも登録されてしまう。
 *
 * 例外を投げずに結果を返すので、そのままテストできる。
 */
import { prisma } from "./prisma";
import { isWithinWorking, resolveWorkingIntervals } from "./availability-core";
import { type Actor, canManageStaffReservation, denyMessage } from "./permissions";
import { dayOfWeekOf } from "./time";

/** トランザクションの中で使えるクライアント */
type Tx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; message: string };

/** 予約として使える状態 */
export const RESERVATION_STATUSES = ["booked", "done", "canceled", "no_show"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  booked: "予約済み",
  done: "来店済み",
  canceled: "キャンセル",
  no_show: "無断キャンセル",
};

/**
 * その枠が使えるか確かめる。使えなければ例外を投げる。
 * 新規登録と日時変更の両方から呼ぶ。
 */
async function ensureSlotUsable(
  tx: Tx,
  params: {
    tenantId: string;
    date: string;
    staffId: string;
    menuId: string;
    startMinutes: number;
    endMinutes: number;
    /** 日時変更のとき、自分自身は重複の対象から外す */
    excludeReservationId?: string;
  },
) {
  const { tenantId, date, staffId, menuId, startMinutes, endMinutes } = params;

  const staff = await tx.staff.findFirst({ where: { id: staffId, tenantId, isActive: true } });
  if (!staff) throw new Error("スタッフが見つかりません");

  const canDo = await tx.staffMenu.findFirst({ where: { tenantId, staffId, menuId } });
  if (!canDo) throw new Error(`${staff.name} はこのメニューを担当できません`);

  // 勤務時間の中に収まっているか
  const [businessHours, dateOverrides] = await Promise.all([
    tx.businessHour.findMany({
      where: { tenantId, dayOfWeek: dayOfWeekOf(date), OR: [{ staffId: null }, { staffId }] },
    }),
    tx.dateOverride.findMany({
      where: { tenantId, date, OR: [{ staffId: null }, { staffId }] },
    }),
  ]);
  const working = resolveWorkingIntervals({ staffId, businessHours, dateOverrides });
  if (!isWithinWorking(working, startMinutes, endMinutes)) {
    throw new Error("その時間は勤務時間外です");
  }

  // 既存の予約と重なっていないか（ここが二重予約の防波堤）
  // 「既存の開始 < 新規の終了」かつ「新規の開始 < 既存の終了」なら重なっている
  const conflict = await tx.reservation.findFirst({
    where: {
      tenantId,
      staffId,
      date,
      status: "booked",
      startMinutes: { lt: endMinutes },
      endMinutes: { gt: startMinutes },
      ...(params.excludeReservationId ? { id: { not: params.excludeReservationId } } : {}),
    },
  });
  if (conflict) throw new Error("この枠は、ちょうど今ほかの予約で埋まりました");

  // 予約以外で塞がっている時間（会議・清掃など）とも重なっていないか
  const block = await tx.block.findFirst({
    where: {
      tenantId,
      date,
      OR: [{ staffId: null }, { staffId }],
      startMinutes: { lt: endMinutes },
      endMinutes: { gt: startMinutes },
    },
  });
  if (block) throw new Error(`その時間は「${block.reason}」で塞がっています`);
}

// ── 新規登録 ──────────────────────────────

export type BookingInput = {
  actor: Actor;
  tenantId: string;
  date: string; // "YYYY-MM-DD"
  menuId: string;
  staffId: string;
  startMinutes: number;
  /** 既存の顧客を指定する場合 */
  customerId?: string;
  /** 新規の顧客を作る場合 */
  newCustomer?: { name: string; phone?: string };
};

export async function bookReservation(
  input: BookingInput,
): Promise<Result<{ reservationId: string }>> {
  const { actor, tenantId, date, menuId, staffId, startMinutes } = input;

  // スタッフは自分の担当分しか登録できない
  if (!canManageStaffReservation(actor, staffId)) {
    return { ok: false, message: denyMessage(actor) };
  }

  if (!input.customerId && !input.newCustomer?.name) {
    return { ok: false, message: "顧客を選ぶか、新しい顧客の名前を入力してください" };
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "店舗が見つかりません" };

  // tenantId を必ず条件に入れる
  const menu = await prisma.menu.findFirst({ where: { id: menuId, tenantId, isActive: true } });
  if (!menu) return { ok: false, message: "メニューが見つかりません" };

  if (startMinutes % tenant.slotMinutes !== 0) {
    return { ok: false, message: "開始時刻が予約枠の刻みに合っていません" };
  }

  const endMinutes = startMinutes + menu.durationMinutes + menu.bufferMinutes;

  try {
    const reservationId = await prisma.$transaction(async (tx) => {
      await ensureSlotUsable(tx, {
        tenantId,
        date,
        staffId,
        menuId,
        startMinutes,
        endMinutes,
      });

      let customerId = input.customerId;
      if (customerId) {
        const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId } });
        if (!customer) throw new Error("顧客が見つかりません");
      } else {
        const created = await tx.customer.create({
          data: {
            tenantId,
            name: input.newCustomer!.name,
            phone: input.newCustomer?.phone || null,
          },
        });
        customerId = created.id;
      }

      const reservation = await tx.reservation.create({
        data: {
          tenantId,
          staffId,
          customerId,
          menuId,
          date,
          startMinutes,
          endMinutes,
          // 予約した時点の値を残す。後でメニューを変えても過去の予約は変わらない
          menuNameSnapshot: menu.name,
          durationSnapshot: menu.durationMinutes,
          priceSnapshot: menu.price,
          status: "booked",
        },
      });

      return reservation.id;
    });

    return { ok: true, reservationId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "登録に失敗しました" };
  }
}

// ── 日時・担当の変更 ──────────────────────

export type RescheduleInput = {
  actor: Actor;
  tenantId: string;
  reservationId: string;
  date: string;
  staffId: string;
  startMinutes: number;
};

export async function rescheduleReservation(input: RescheduleInput): Promise<Result> {
  const { actor, tenantId, reservationId, date, staffId, startMinutes } = input;

  // 変更先の担当が自分であること（他人へ付け替えられないように）
  if (!canManageStaffReservation(actor, staffId)) {
    return { ok: false, message: denyMessage(actor) };
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "店舗が見つかりません" };

  if (startMinutes % tenant.slotMinutes !== 0) {
    return { ok: false, message: "開始時刻が予約枠の刻みに合っていません" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: { id: reservationId, tenantId },
      });
      if (!reservation) throw new Error("予約が見つかりません");

      // 変更前の担当も自分であること（他人の予約を奪えないように）
      if (!canManageStaffReservation(actor, reservation.staffId)) {
        throw new Error(denyMessage(actor));
      }

      if (reservation.status !== "booked") {
        throw new Error("この予約は変更できません（すでに完了またはキャンセル済み）");
      }

      // 所要時間は予約時点の値を使う。
      // メニューの設定が後から変わっても、この予約の長さは変えない。
      const endMinutes = startMinutes + (reservation.endMinutes - reservation.startMinutes);

      await ensureSlotUsable(tx, {
        tenantId,
        date,
        staffId,
        menuId: reservation.menuId,
        startMinutes,
        endMinutes,
        excludeReservationId: reservationId,
      });

      // tenantId を where に残したまま更新する（条件の書き忘れを防ぐ）
      await tx.reservation.updateMany({
        where: { id: reservationId, tenantId },
        data: { date, staffId, startMinutes, endMinutes },
      });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "変更に失敗しました" };
  }
}

// ── 状態の変更 ────────────────────────────

export async function setReservationStatus(input: {
  actor: Actor;
  tenantId: string;
  reservationId: string;
  status: ReservationStatus;
}): Promise<Result> {
  const { actor, tenantId, reservationId, status } = input;

  if (!RESERVATION_STATUSES.includes(status)) {
    return { ok: false, message: "状態の指定が正しくありません" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: { id: reservationId, tenantId },
      });
      if (!reservation) throw new Error("予約が見つかりません");

      if (!canManageStaffReservation(actor, reservation.staffId)) {
        throw new Error(denyMessage(actor));
      }

      // キャンセル済みを「予約済み」に戻すときは、その間に別の予約が
      // 入っていないか確かめる。ここを抜くと復帰で二重予約になる。
      if (status === "booked" && reservation.status !== "booked") {
        await ensureSlotUsable(tx, {
          tenantId,
          date: reservation.date,
          staffId: reservation.staffId,
          menuId: reservation.menuId,
          startMinutes: reservation.startMinutes,
          endMinutes: reservation.endMinutes,
          excludeReservationId: reservationId,
        });
      }

      // 予約は消さず、状態を変えて残す（キャンセル履歴は分析にも使う）
      await tx.reservation.updateMany({
        where: { id: reservationId, tenantId },
        data: {
          status,
          canceledAt: status === "canceled" || status === "no_show" ? new Date() : null,
        },
      });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "変更に失敗しました" };
  }
}
