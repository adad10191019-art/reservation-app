"use server";

/**
 * 自分の予定（ブロック枠・日付ごとの勤務時間）を、本人が自分の分だけ
 * 作成・削除するための操作。
 *
 * settings-actions.ts の同種の処理（createBlock など）はオーナー専用で、
 * 対象を誰にでも指定できる。こちらは常に「自分自身」に固定し、
 * 他人の分には一切触れられないようにする。
 *
 * すべて requireSession（オーナーでなくてよい）で、
 * かつ session.staffId が無いアカウント（スタッフに紐づいていない）は弾く。
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "./auth";
import { logChange } from "./change-log";
import { parseRanges } from "./ranges";
import { prisma } from "./prisma";
import { formatDateLabel, hm, toHm } from "./time";

const PATH = "/my-schedule";

function back(date: string, message?: string): never {
  const path = `${PATH}?date=${encodeURIComponent(date)}`;
  redirect(message ? `${path}&error=${encodeURIComponent(message)}` : `${path}&done=1`);
}

async function requireOwnStaffId(): Promise<{ tenantId: string; staffId: string; name: string }> {
  const session = await requireSession();
  if (!session.staffId) {
    redirect(
      `${PATH}?error=${encodeURIComponent(
        "このアカウントはスタッフに紐づいていないため使えません",
      )}`,
    );
  }
  return { tenantId: session.tenantId, staffId: session.staffId, name: session.name };
}

/**
 * 自分の、この日だけの勤務時間（入り・出）を保存する。
 * 空欄なら曜日ごとの基本パターンに戻る。
 *
 * 昼休憩など、勤務の途中で空けたい時間は、ここではなく
 * 下の「自分の予定（ブロック枠）」に入れてもらう。1本の勤務時間 ＋
 * その中を塞ぐ予定、という2つの仕組みに分けたほうが、
 * 「入り・出だけ入れればいい」というシンプルな入力で済む。
 */
export async function saveOwnDayOverride(formData: FormData) {
  const { tenantId, staffId, name } = await requireOwnStaffId();
  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back(date, "日付の形式が正しくありません");

  const isClosed = formData.get("closed") === "on";
  const startText = String(formData.get("start") ?? "").trim();
  const endText = String(formData.get("end") ?? "").trim();

  type Row = { isClosed: boolean; startMinutes: number | null; endMinutes: number | null };
  let rows: Row[] = [];

  if (isClosed) {
    rows = [{ isClosed: true, startMinutes: null, endMinutes: null }];
  } else if (startText && endText) {
    let start: number;
    let end: number;
    try {
      start = hm(startText);
      end = hm(endText);
    } catch {
      back(date, "時刻の形式が正しくありません");
    }
    if (end <= start) back(date, "「出」は「入り」より後の時刻にしてください");
    rows = [{ isClosed: false, startMinutes: start, endMinutes: end }];
  } else if (startText || endText) {
    back(date, "「入り」「出」は両方入力してください（空欄にする場合は両方消してください）");
  }
  // 両方空欄なら rows は空のまま → 曜日ごとの基本パターンに戻る

  await prisma.$transaction(async (tx) => {
    await tx.dateOverride.deleteMany({ where: { tenantId, staffId, date } });
    if (rows.length > 0) {
      await tx.dateOverride.createMany({
        data: rows.map((r) => ({ ...r, tenantId, staffId, date })),
      });
    }
  });

  await logChange({
    tenantId,
    actorName: name,
    entity: "dateOverride",
    action: "created",
    summary: `${formatDateLabel(date)} の自分の勤務時間を変更（${name} 本人）`,
  });

  revalidatePath("/calendar");
  revalidatePath("/calendar/week");
  revalidatePath("/booking");
  revalidatePath(PATH);
  back(date);
}

/** 自分の予定（ブロック枠）を1件追加する */
export async function createOwnBlock(formData: FormData) {
  const { tenantId, staffId, name } = await requireOwnStaffId();
  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back(date, "日付の形式が正しくありません");

  const reason = String(formData.get("reason") ?? "").trim();
  const startText = String(formData.get("start") ?? "");
  const endText = String(formData.get("end") ?? "");
  if (!reason) back(date, "内容を入力してください");

  const result = parseRanges(`${startText}-${endText}`);
  if (!result.ok) back(date, result.message);
  if (result.intervals.length !== 1) back(date, "時間の指定が正しくありません");
  const interval = result.intervals[0];

  // すでに入っている自分の予約と重なる場合は知らせる（登録自体は認める）
  const overlapping = await prisma.reservation.count({
    where: {
      tenantId,
      staffId,
      date,
      status: "booked",
      startMinutes: { lt: interval.end },
      endMinutes: { gt: interval.start },
    },
  });

  await prisma.block.create({
    data: { tenantId, staffId, date, startMinutes: interval.start, endMinutes: interval.end, reason },
  });

  await logChange({
    tenantId,
    actorName: name,
    entity: "block",
    action: "created",
    summary: `${formatDateLabel(date)} ${toHm(interval.start)}-${toHm(interval.end)} ${reason}（${name} 本人）を追加`,
  });

  revalidatePath("/calendar");
  revalidatePath("/calendar/week");
  revalidatePath("/booking");
  revalidatePath(PATH);

  if (overlapping > 0) {
    back(
      date,
      `登録しましたが、この時間にはすでに予約が${overlapping}件あります。カレンダーで確認してください`,
    );
  }
  back(date);
}

/** 自分の予定（ブロック枠）を1件削除する。他人の分は消せない */
export async function deleteOwnBlock(formData: FormData) {
  const { tenantId, staffId, name } = await requireOwnStaffId();
  const date = String(formData.get("date") ?? "");
  const id = String(formData.get("id") ?? "");

  // 消える前に内容を控えておく。staffId も条件に入れ、他人の分は対象にしない
  const block = await prisma.block.findFirst({ where: { id, tenantId, staffId } });
  if (!block) back(date, "見つかりません（他の人の予定は削除できません）");

  const deleted = await prisma.block.deleteMany({ where: { id, tenantId, staffId } });
  if (deleted.count === 0) back(date, "見つかりません");

  await logChange({
    tenantId,
    actorName: name,
    entity: "block",
    action: "deleted",
    summary: `${formatDateLabel(block.date)} ${toHm(block.startMinutes)}-${toHm(block.endMinutes)} ${block.reason}（${name} 本人）を削除`,
  });

  revalidatePath("/calendar");
  revalidatePath("/calendar/week");
  revalidatePath("/booking");
  revalidatePath(PATH);
  back(date);
}
