/**
 * 予約の登録。
 *
 * 画面から送られてきた値は一切信用せず、ここで全部確かめ直す。
 * 特に「その枠が本当に空いているか」は、登録と同じトランザクションの中で
 * もう一度確かめる。そうしないと、2人が同時に同じ枠を押したときに
 * 両方とも登録されてしまう。
 *
 * 例外を投げずに結果を返すので、そのままテストできる。
 */
import { prisma } from "./prisma";
import { isWithinWorking, resolveWorkingIntervals } from "./availability-core";
import { dayOfWeekOf } from "./time";

export type BookingInput = {
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

export type BookingResult =
  | { ok: true; reservationId: string }
  | { ok: false; message: string };

export async function bookReservation(input: BookingInput): Promise<BookingResult> {
  const { tenantId, date, menuId, staffId, startMinutes } = input;

  if (!input.customerId && !input.newCustomer?.name) {
    return { ok: false, message: "顧客を選ぶか、新しい顧客の名前を入力してください" };
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "店舗が見つかりません" };

  // tenantId を必ず条件に入れる
  const menu = await prisma.menu.findFirst({
    where: { id: menuId, tenantId, isActive: true },
  });
  if (!menu) return { ok: false, message: "メニューが見つかりません" };

  if (startMinutes % tenant.slotMinutes !== 0) {
    return { ok: false, message: "開始時刻が予約枠の刻みに合っていません" };
  }

  const endMinutes = startMinutes + menu.durationMinutes + menu.bufferMinutes;

  try {
    const reservationId = await prisma.$transaction(async (tx) => {
      const staff = await tx.staff.findFirst({
        where: { id: staffId, tenantId, isActive: true },
      });
      if (!staff) throw new Error("スタッフが見つかりません");

      const canDo = await tx.staffMenu.findFirst({ where: { tenantId, staffId, menuId } });
      if (!canDo) throw new Error(`${staff.name} はこのメニューを担当できません`);

      // 勤務時間の中に収まっているか
      const [businessHours, dateOverrides] = await Promise.all([
        tx.businessHour.findMany({
          where: {
            tenantId,
            dayOfWeek: dayOfWeekOf(date),
            OR: [{ staffId: null }, { staffId }],
          },
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
        },
      });
      if (conflict) throw new Error("この枠は、ちょうど今ほかの予約で埋まりました");

      // 顧客（既存を選ぶか、新規を作る）
      let customerId = input.customerId;
      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, tenantId },
        });
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
