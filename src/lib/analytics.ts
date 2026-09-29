/**
 * 予約の集計。
 *
 * 件数が極端に多い店舗を想定していないため、対象期間の予約を一度に読み出して
 * JS側で集計する（Prismaのgroupbyを使うほどの規模ではなく、こちらのほうが
 * 何を数えているか読みやすい）。
 */
import { prisma } from "./prisma";
import { addDays } from "./time";

/** 売上として数えるステータス（キャンセル・無断キャンセルは含めない） */
const COUNTED_FOR_SALES = new Set(["booked", "done"]);

/** 集計期間が長すぎて画面が壊れないための上限（約1年3ヶ月分） */
const MAX_DAYS_IN_RANGE = 400;

export type ReservationSummary = {
  from: string;
  to: string;
  totalCount: number;
  byStatus: Record<string, number>;
  /** booked・done の priceSnapshot 合計 */
  salesTotal: number;
  dailyCounts: { date: string; count: number }[];
  /** 0時〜23時。開始時刻がその時に入る予約の数 */
  hourlyCounts: { hour: number; count: number }[];
  byStaff: { staffId: string; name: string; count: number }[];
  byMenu: { menuId: string; name: string; count: number }[];
};

export async function buildReservationSummary(
  tenantId: string,
  from: string,
  to: string,
): Promise<ReservationSummary> {
  const reservations = await prisma.reservation.findMany({
    where: { tenantId, date: { gte: from, lte: to } },
    include: { staff: { select: { name: true } } },
    orderBy: { date: "asc" },
  });

  const byStatus: Record<string, number> = {};
  let salesTotal = 0;
  const dailyMap = new Map<string, number>();
  const hourlyMap = new Map<number, number>();
  const staffMap = new Map<string, { name: string; count: number }>();
  const menuMap = new Map<string, { name: string; count: number }>();

  for (const r of reservations) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (COUNTED_FOR_SALES.has(r.status)) salesTotal += r.priceSnapshot;

    dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + 1);

    const hour = Math.floor(r.startMinutes / 60);
    hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + 1);

    const staffEntry = staffMap.get(r.staffId) ?? { name: r.staff.name, count: 0 };
    staffEntry.count += 1;
    staffMap.set(r.staffId, staffEntry);

    // メニューは予約時点の名前（menuNameSnapshot）で数える。
    // あとでメニュー名を変えても、過去の集計が変わらないようにするため
    const menuEntry = menuMap.get(r.menuId) ?? { name: r.menuNameSnapshot, count: 0 };
    menuEntry.count += 1;
    menuMap.set(r.menuId, menuEntry);
  }

  const dailyCounts: { date: string; count: number }[] = [];
  for (let d = from, i = 0; d <= to && i < MAX_DAYS_IN_RANGE; d = addDays(d, 1), i++) {
    dailyCounts.push({ date: d, count: dailyMap.get(d) ?? 0 });
  }

  const hourlyCounts = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourlyMap.get(hour) ?? 0,
  }));

  const byStaff = Array.from(staffMap.entries())
    .map(([staffId, v]) => ({ staffId, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const byMenu = Array.from(menuMap.entries())
    .map(([menuId, v]) => ({ menuId, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return {
    from,
    to,
    totalCount: reservations.length,
    byStatus,
    salesTotal,
    dailyCounts,
    hourlyCounts,
    byStaff,
    byMenu,
  };
}

// ── CSVエクスポート ────────────────────────

const STATUS_LABEL: Record<string, string> = {
  booked: "予約中",
  done: "完了",
  canceled: "キャンセル",
  no_show: "無断キャンセル",
};

/** カンマ・改行・ダブルクォートを含む場合だけ引用符で囲む */
function csvField(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function buildReservationsCsv(
  tenantId: string,
  from: string,
  to: string,
): Promise<string> {
  const reservations = await prisma.reservation.findMany({
    where: { tenantId, date: { gte: from, lte: to } },
    include: { staff: { select: { name: true } }, customer: { select: { name: true, phone: true, email: true } } },
    orderBy: [{ date: "asc" }, { startMinutes: "asc" }],
  });

  const header = [
    "日付",
    "開始",
    "終了",
    "スタッフ",
    "顧客名",
    "電話番号",
    "メールアドレス",
    "メニュー",
    "金額",
    "ステータス",
    "メモ",
  ];

  const toHm = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  const rows = reservations.map((r) =>
    [
      r.date,
      toHm(r.startMinutes),
      toHm(r.endMinutes),
      r.staff.name,
      r.customer.name,
      r.customer.phone ?? "",
      r.customer.email ?? "",
      r.menuNameSnapshot,
      r.priceSnapshot,
      STATUS_LABEL[r.status] ?? r.status,
      r.note ?? "",
    ]
      .map(csvField)
      .join(","),
  );

  // Excelで開いたときに文字化けしないよう、先頭にUTF-8のBOMを付ける
  return "﻿" + [header.join(","), ...rows].join("\r\n") + "\r\n";
}
