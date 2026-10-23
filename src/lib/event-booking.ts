/**
 * イベント（定員つきの集まり）への申し込みとキャンセル。
 *
 * 予約（booking.ts）と同じく、画面から来た値は信用せずここで確かめ直す。
 * 定員は「数えてから入れる」ので、同時に申し込まれても定員を超えないよう、
 * イベントの行を押さえた取引の中で数える。
 *
 * 例外を投げずに結果を返すので、そのままテストできる。
 */
import { slotDateTime } from "./booking-window";
import { prisma } from "./prisma";

export type EventResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

/** 取引が競合・デッドロックで中断されたときのエラーか（booking.ts と同じ判定） */
function isWriteConflict(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: string }).code;
  return code === "P2034" || code === "40001";
}

async function withRetry<T>(run: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await run();
    } catch (e) {
      if (!isWriteConflict(e)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * 申し込みとキャンセルの締め切り前か。予約と同じく「開始の何分前まで」（設定→店舗）を使う。
 * 「何日先まで受けるか」は見ない（イベントは開催日を決めた側が決めるため）
 */
export function isBeforeEventDeadline(
  event: { date: string; startMinutes: number },
  leadMinutes: number,
  now: Date = new Date(),
): boolean {
  const deadline = slotDateTime(event.date, event.startMinutes).getTime() - leadMinutes * 60 * 1000;
  return now.getTime() <= deadline;
}

/** 申し込み済みの人数（キャンセルは数えない） */
export function countBooked(eventId: string): Promise<number> {
  return prisma.eventEntry.count({ where: { eventId, status: "booked" } });
}

/**
 * お客様がイベントに申し込む。
 * 受付中・締め切り前・定員に空きがある・まだ申し込んでいない、のときだけ通す。
 * 前にキャンセルした人は、同じ申し込みの行を戻して使う。
 */
export async function applyToEvent(input: {
  tenantId: string;
  customerId: string;
  eventId: string;
  now?: Date;
}): Promise<EventResult<{ entryId: string }>> {
  const { tenantId, customerId, eventId } = input;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "店舗が見つかりません" };

  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId } });
  if (!event || !event.isOpen) return { ok: false, message: "このイベントは受付をしていません" };

  if (!isBeforeEventDeadline(event, tenant.bookingLeadMinutes, input.now)) {
    return { ok: false, message: "申し込みの受付は終了しました" };
  }

  try {
    const entryId = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        // イベントの行を押さえて、同じイベントへの申し込みを1件ずつ順番に通す。
        // Serializable だけだと、同時に来た人の多くが「競合」で弾かれてしまう
        // （LINE でお知らせした直後など、申し込みが集中したときに困る）
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;

        const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId } });
        if (!customer) throw new Error("お客様の情報が見つかりません");

        const existing = await tx.eventEntry.findUnique({
          where: { eventId_customerId: { eventId, customerId } },
        });
        if (existing?.status === "booked") throw new Error("すでにお申し込み済みです");

        // 定員は取引の中で数える（同時に申し込まれても超えないように）
        const booked = await tx.eventEntry.count({ where: { eventId, status: "booked" } });
        if (booked >= event.capacity) throw new Error("申し訳ありません、満席になりました");

        const entry = existing
          ? await tx.eventEntry.update({
              where: { id: existing.id },
              data: { status: "booked", canceledAt: null, reminderSentAt: null },
            })
          : await tx.eventEntry.create({ data: { tenantId, eventId, customerId } });
        return entry.id;
      }),
    );
    return { ok: true, entryId };
  } catch (e) {
    if (isWriteConflict(e)) {
      return { ok: false, message: "申し込みが混み合っています。もう一度お試しください" };
    }
    return { ok: false, message: e instanceof Error ? e.message : "申し込みに失敗しました" };
  }
}

/**
 * お客様自身によるキャンセル。自分の申し込みだけ、かつ締め切り前だけ。
 * 同時に2回送られても変わるのは1回だけ（changed で通知の要否を返す）
 */
export async function cancelOwnEntry(input: {
  tenantId: string;
  customerId: string;
  entryId: string;
  now?: Date;
}): Promise<EventResult<{ changed: boolean }>> {
  const { tenantId, customerId, entryId } = input;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "店舗が見つかりません" };

  const entry = await prisma.eventEntry.findFirst({
    where: { id: entryId, tenantId, customerId },
    include: { event: true },
  });
  if (!entry) return { ok: false, message: "お申し込みが見つかりません" };
  if (entry.status !== "booked") return { ok: false, message: "このお申し込みはキャンセルできません" };

  if (!isBeforeEventDeadline(entry.event, tenant.bookingLeadMinutes, input.now)) {
    return { ok: false, message: "開始が近いため、お電話でご連絡ください" };
  }

  const updated = await prisma.eventEntry.updateMany({
    where: { id: entryId, tenantId, customerId, status: "booked" },
    data: { status: "canceled", canceledAt: new Date() },
  });
  return { ok: true, changed: updated.count > 0 };
}

/** 店舗側が申し込みを取り消す（締め切りに関係なくできる） */
export async function cancelEntryByShop(input: {
  tenantId: string;
  entryId: string;
}): Promise<EventResult<{ changed: boolean }>> {
  const updated = await prisma.eventEntry.updateMany({
    where: { id: input.entryId, tenantId: input.tenantId, status: "booked" },
    data: { status: "canceled", canceledAt: new Date() },
  });
  return { ok: true, changed: updated.count > 0 };
}
