"use server";

/**
 * 設定 → イベント の保存・削除と、店舗側からの申し込みの取り消し（オーナーのみ）。
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "./auth";
import { cancelEntryByShop } from "./event-booking";
import { notifyEventEntryCanceled } from "./notify";
import { prisma } from "./prisma";
import { hm } from "./time";

const LIST_PATH = "/settings/events";

function back(path: string, message?: string): never {
  redirect(message ? `${path}?error=${encodeURIComponent(message)}` : `${path}?done=1`);
}

function toMinutes(value: FormDataEntryValue | null): number | null {
  try {
    const m = hm(String(value ?? "").trim());
    return m >= 0 && m <= 24 * 60 ? m : null;
  } catch {
    return null;
  }
}

function refresh() {
  revalidatePath(LIST_PATH, "layout");
  revalidatePath("/book", "layout");
}

/** イベントを作る・直す。id があれば直す */
export async function saveEvent(formData: FormData) {
  const session = await requireOwner();

  const id = String(formData.get("id") ?? "");
  const path = id ? `${LIST_PATH}/${id}` : LIST_PATH;

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const startMinutes = toMinutes(formData.get("start"));
  const endMinutes = toMinutes(formData.get("end"));
  const capacity = Number(String(formData.get("capacity") ?? "").trim());
  const isOpen = formData.get("isOpen") === "on";

  if (!title) back(path, "イベント名を入力してください");
  if (title.length > 100) back(path, "イベント名は100文字までにしてください");
  if (description.length > 2000) back(path, "説明は2000文字までにしてください");
  if (venue.length > 200) back(path, "会場は200文字までにしてください");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back(path, "開催日を選んでください");
  if (startMinutes === null || endMinutes === null) back(path, "開始と終了の時刻を入れてください");
  if (endMinutes <= startMinutes) back(path, "終了は開始より後にしてください");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
    back(path, "定員は1〜10000の数で入れてください");
  }

  const data = { title, description, venue, date, startMinutes, endMinutes, capacity, isOpen };

  if (id) {
    // 定員を、すでに申し込んだ人数より少なくはできない（誰かを外すことになるため）
    const booked = await prisma.eventEntry.count({
      where: { eventId: id, tenantId: session.tenantId, status: "booked" },
    });
    if (capacity < booked) {
      back(path, `すでに${booked}名が申し込んでいるため、定員をそれより少なくはできません`);
    }
    const updated = await prisma.event.updateMany({ where: { id, tenantId: session.tenantId }, data });
    if (updated.count === 0) back(LIST_PATH, "イベントが見つかりません");
    refresh();
    back(path);
  }

  const created = await prisma.event.create({ data: { ...data, tenantId: session.tenantId } });
  refresh();
  back(`${LIST_PATH}/${created.id}`);
}

/**
 * イベントを消す。申し込みが1件でもあれば（キャンセル済みも含む）消さない。
 * 申し込みのあったイベントは、受付を止めて残しておく
 */
export async function deleteEvent(formData: FormData) {
  const session = await requireOwner();
  const id = String(formData.get("id") ?? "");

  const event = await prisma.event.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { _count: { select: { entries: true } } },
  });
  if (!event) back(LIST_PATH, "イベントが見つかりません");
  if (event._count.entries > 0) {
    back(`${LIST_PATH}/${id}`, "申し込みがあったイベントは消せません。「受付中」のチェックを外してください");
  }

  await prisma.event.delete({ where: { id: event.id } });
  refresh();
  back(LIST_PATH);
}

/** 店舗側から申し込みを取り消す。お客様にはキャンセルの知らせを送る */
export async function cancelEntryAsShop(formData: FormData) {
  const session = await requireOwner();
  const eventId = String(formData.get("eventId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const path = `${LIST_PATH}/${eventId}`;

  const result = await cancelEntryByShop({ tenantId: session.tenantId, entryId });
  if (result.ok && result.changed) await notifyEventEntryCanceled(entryId);

  refresh();
  back(path);
}
