/**
 * 他店舗のデータが混ざらないことを、実際のDBで確かめるスクリプト。
 *
 *   npm run check:tenant
 *
 * 2つの店舗にデータを入れたうえで、
 * 「店舗Bとして操作したときに、店舗Aのものが見えたり触れたりしないか」を見る。
 *
 * 変更したものは最後に元へ戻す。
 */
import "dotenv/config";
import { findAvailability } from "../src/lib/availability";
import {
  bookReservation,
  rescheduleReservation,
  setReservationStatus,
} from "../src/lib/booking";
import type { Actor } from "../src/lib/permissions";
import { prisma } from "../src/lib/prisma";
import { getDaySchedule } from "../src/lib/schedule";

const results: { label: string; ok: boolean; detail: string }[] = [];

function check(label: string, ok: boolean, detail: string) {
  results.push({ label, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${label}: ${detail}`);
}

async function main() {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "asc" } });
  const [a, b] = tenants;
  if (!a || !b) throw new Error("店舗が2つ必要です。npm run db:seed を実行してください");

  console.log(`店舗A: ${a.name}\n店舗B: ${b.name}\n`);

  const owner: Actor = { role: "owner", staffId: null };

  // 店舗Aの代表的なデータ
  const aReservation = await prisma.reservation.findFirst({
    where: { tenantId: a.id, status: "booked" },
  });
  const aStaff = await prisma.staff.findFirst({ where: { tenantId: a.id } });
  const aMenu = await prisma.menu.findFirst({ where: { tenantId: a.id } });
  const aCustomer = await prisma.customer.findFirst({ where: { tenantId: a.id } });
  if (!aReservation || !aStaff || !aMenu || !aCustomer) {
    throw new Error("店舗Aのデータが足りません");
  }

  const bStaff = await prisma.staff.findFirst({ where: { tenantId: b.id } });
  const bMenu = await prisma.menu.findFirst({ where: { tenantId: b.id } });
  if (!bStaff || !bMenu) throw new Error("店舗Bのデータが足りません");

  // ── 読み取り ────────────────────────────

  // 1. 店舗Bのカレンダーに、店舗Aのスタッフや予約が出ないか
  const schedule = await getDaySchedule({ tenantId: b.id, date: aReservation.date });
  const leakedStaff = schedule.columns.filter((c) => c.staffId === aStaff.id);
  const leakedReservations = schedule.columns.flatMap((c) =>
    c.reservations.filter((r) => r.id === aReservation.id),
  );
  check(
    "店舗Bのカレンダーに店舗Aのスタッフが出ない",
    leakedStaff.length === 0,
    leakedStaff.length === 0 ? `列は ${schedule.columns.length} 件（Bのみ）` : "漏れている",
  );
  check(
    "店舗Bのカレンダーに店舗Aの予約が出ない",
    leakedReservations.length === 0,
    leakedReservations.length === 0 ? "なし" : "漏れている",
  );

  // 2. 店舗Bとして、店舗Aのメニューで空き枠を探せないか
  let availabilityBlocked = false;
  let availabilityDetail = "";
  try {
    await findAvailability({ tenantId: b.id, date: aReservation.date, menuId: aMenu.id });
    availabilityDetail = "取得できてしまった";
  } catch (e) {
    availabilityBlocked = true;
    availabilityDetail = e instanceof Error ? e.message : "拒否された";
  }
  check("店舗Aのメニューでは空き枠を探せない", availabilityBlocked, availabilityDetail);

  // 3. 店舗Bとして、店舗Aの予約を読めないか（詳細画面と同じ条件）
  const crossRead = await prisma.reservation.findFirst({
    where: { id: aReservation.id, tenantId: b.id },
  });
  check("店舗Aの予約を店舗Bからは読めない", crossRead === null, crossRead ? "読めてしまった" : "見つからない");

  // ── 書き込み ────────────────────────────

  // 4. 店舗Bとして、店舗Aの予約をキャンセルできないか
  const r4 = await setReservationStatus({
    actor: owner,
    tenantId: b.id,
    reservationId: aReservation.id,
    status: "canceled",
  });
  check("店舗Aの予約を店舗Bからキャンセルできない", !r4.ok, r4.ok ? "できてしまった" : r4.message);

  // 5. 店舗Bとして、店舗Aの予約を動かせないか
  const r5 = await rescheduleReservation({
    actor: owner,
    tenantId: b.id,
    reservationId: aReservation.id,
    date: aReservation.date,
    staffId: bStaff.id,
    startMinutes: 10 * 60,
  });
  check("店舗Aの予約を店舗Bから動かせない", !r5.ok, r5.ok ? "できてしまった" : r5.message);

  // 6. 店舗Bとして、店舗Aのスタッフに予約を入れられないか
  const r6 = await bookReservation({
    actor: owner,
    tenantId: b.id,
    date: aReservation.date,
    menuId: bMenu.id,
    staffId: aStaff.id,
    startMinutes: 10 * 60,
    newCustomer: { name: "越境検証" },
  });
  check("店舗Aのスタッフには店舗Bから予約できない", !r6.ok, r6.ok ? "できてしまった" : r6.message);

  // 7. 店舗Bとして、店舗Aのメニューで予約を入れられないか
  const r7 = await bookReservation({
    actor: owner,
    tenantId: b.id,
    date: aReservation.date,
    menuId: aMenu.id,
    staffId: bStaff.id,
    startMinutes: 10 * 60,
    newCustomer: { name: "越境検証" },
  });
  check("店舗Aのメニューでは店舗Bから予約できない", !r7.ok, r7.ok ? "できてしまった" : r7.message);

  // 8. 店舗Bとして、店舗Aの顧客を紐づけられないか
  const r8 = await bookReservation({
    actor: owner,
    tenantId: b.id,
    date: aReservation.date,
    menuId: bMenu.id,
    staffId: bStaff.id,
    startMinutes: 10 * 60,
    customerId: aCustomer.id,
  });
  check("店舗Aの顧客は店舗Bから紐づけられない", !r8.ok, r8.ok ? "できてしまった" : r8.message);

  // ── 後片付け ────────────────────────────
  const leftovers = await prisma.customer.findMany({ where: { name: "越境検証" } });
  if (leftovers.length > 0) {
    const ids = leftovers.map((c) => c.id);
    await prisma.reservation.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    console.log(`\n後片付け: 顧客 ${leftovers.length} 件を削除`);
  }

  // 店舗Aの予約が変わっていないことを確かめる
  const after = await prisma.reservation.findUnique({ where: { id: aReservation.id } });
  const untouched =
    after?.status === aReservation.status &&
    after?.staffId === aReservation.staffId &&
    after?.startMinutes === aReservation.startMinutes &&
    after?.date === aReservation.date;
  check("店舗Aの予約が書き換わっていない", untouched, untouched ? "元のまま" : "変わってしまった");

  const allPassed = results.every((r) => r.ok);
  console.log(`\n判定: ${allPassed ? "OK 店舗間でデータは分離されている" : "NG 見直しが必要"}`);
  if (!allPassed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
