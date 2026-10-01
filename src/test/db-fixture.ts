/**
 * DB テスト用のデータ作りと後片付け。
 *
 * テストごとに専用の店舗を1つ作り、その中だけで予約を取り合う。
 * 開発用 DB にある既存の店舗（seed のデータなど）には触らない。
 * 終わったら、作った店舗に属する行を全部消す。
 *
 * 日付は 2099 年を使う。リマインドのように「その日の全店舗の予約」を
 * 見る処理でも、開発中に手で入れた予約を拾わないようにするため。
 */
import { prisma } from "@/lib/prisma";

/** 2099-01-05 は月曜日。勤務時間は全曜日に入れるので、曜日に意味はない */
export const TEST_DATE = "2099-01-05";
export const TEST_DATE_2 = "2099-01-06";

/** 店舗の勤務時間 10:00〜19:00 */
export const OPEN = 10 * 60;
export const CLOSE = 19 * 60;

export type TestShop = Awaited<ReturnType<typeof createTestShop>>;

/**
 * テスト用の店舗を作る。
 *   スタッフ：A（カット・カラー）、B（カットのみ）
 *   メニュー：カット 60分＋片付け15分、カラー 90分
 *   勤務時間：店舗全体で毎日 10:00〜19:00
 *   顧客：1人（LINE 未連携）
 */
export async function createTestShop(label: string) {
  const tenant = await prisma.tenant.create({
    data: { name: `[自動テスト] ${label}`, slotMinutes: 15 },
  });
  const tenantId = tenant.id;

  const staffA = await prisma.staff.create({ data: { tenantId, name: "テスト担当A" } });
  const staffB = await prisma.staff.create({ data: { tenantId, name: "テスト担当B" } });

  const cut = await prisma.menu.create({
    data: { tenantId, name: "カット", durationMinutes: 60, bufferMinutes: 15, price: 4000 },
  });
  const color = await prisma.menu.create({
    data: { tenantId, name: "カラー", durationMinutes: 90, price: 8000 },
  });

  await prisma.staffMenu.createMany({
    data: [
      { tenantId, staffId: staffA.id, menuId: cut.id },
      { tenantId, staffId: staffA.id, menuId: color.id },
      { tenantId, staffId: staffB.id, menuId: cut.id },
    ],
  });

  await prisma.businessHour.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      tenantId,
      staffId: null,
      dayOfWeek,
      startMinutes: OPEN,
      endMinutes: CLOSE,
    })),
  });

  const customer = await prisma.customer.create({
    data: { tenantId, name: "テスト顧客" },
  });

  return { tenant, tenantId, staffA, staffB, cut, color, customer };
}

/** 店舗に属する行を、参照される側が後になる順ですべて消す */
export async function deleteTestShop(tenantId: string) {
  await prisma.reservation.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.block.deleteMany({ where: { tenantId } });
  await prisma.dateOverride.deleteMany({ where: { tenantId } });
  await prisma.businessHour.deleteMany({ where: { tenantId } });
  await prisma.staffMenu.deleteMany({ where: { tenantId } });
  await prisma.changeLog.deleteMany({ where: { tenantId } });
  await prisma.customerLoginCode.deleteMany({ where: { tenantId } });
  await prisma.googleCalendarConnection.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.menu.deleteMany({ where: { tenantId } });
  await prisma.staff.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}

/** 前回のテストが途中で落ちて残った店舗・社員を消す（名前の印で見分ける） */
export async function deleteLeftoverTestShops() {
  const leftovers = await prisma.tenant.findMany({
    where: { name: { startsWith: "[自動テスト] " } },
    select: { id: true },
  });
  for (const t of leftovers) await deleteTestShop(t.id);
  await deleteTestEmployees();
}

/** テスト用の社員（名簿の行）を作る。店舗とは別に、名前の印で見分けて消す */
export async function createTestEmployee(label: string) {
  return prisma.employee.create({ data: { name: `[自動テスト] ${label}` } });
}

/** テスト用の社員と、その予定を消す。スタッフからのひも付けは先に外す */
export async function deleteTestEmployees() {
  const employees = await prisma.employee.findMany({
    where: { name: { startsWith: "[自動テスト] " } },
    select: { id: true },
  });
  const ids = employees.map((e) => e.id);
  if (ids.length === 0) return;
  await prisma.staff.updateMany({ where: { employeeId: { in: ids } }, data: { employeeId: null } });
  await prisma.employeeEvent.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
}
