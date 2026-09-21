/**
 * 二重予約が防げているかを、実際のDBで確かめるスクリプト。
 *
 *   npm run check:double
 *
 * 作ったデータは最後に消すので、何度実行しても状態は変わらない。
 */
import "dotenv/config";
import { findAvailability } from "../src/lib/availability";
import { bookReservation } from "../src/lib/booking";
import type { Actor } from "../src/lib/permissions";
import { prisma } from "../src/lib/prisma";
import { toHm } from "../src/lib/time";

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

const created: string[] = [];
const createdCustomers: string[] = [];

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) throw new Error("ダミーデータがありません。npm run db:seed を実行してください");

  const menu = await prisma.menu.findFirst({
    where: { tenantId: tenant.id, name: "カット" },
  });
  if (!menu) throw new Error("カットのメニューが見つかりません");

  // 空きがある日を探す
  let date = "";
  let startMinutes = -1;
  let staffId = "";
  for (let i = 1; i <= 10; i++) {
    const d = dateStr(i);
    const a = await findAvailability({ tenantId: tenant.id, date: d, menuId: menu.id });
    if (a.earliest) {
      date = d;
      startMinutes = a.earliest.startMinutes;
      staffId = a.earliest.staffIds[0];
      break;
    }
  }
  if (!date) throw new Error("空きのある日が見つかりませんでした");

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  console.log(`対象: ${date} ${toHm(startMinutes)} / ${staff?.name} / ${menu.name}\n`);

  // 検証ではオーナーとして操作する
  const owner: Actor = { role: "owner", staffId: null };

  const base = {
    actor: owner,
    tenantId: tenant.id,
    date,
    menuId: menu.id,
    staffId,
    startMinutes,
  };

  // 1回目：成功するはず
  const first = await bookReservation({
    ...base,
    newCustomer: { name: "検証用A" },
  });
  console.log(`1回目: ${first.ok ? "成功" : `失敗（${first.message}）`}`);
  if (first.ok) created.push(first.reservationId);

  // 2回目：同じ枠。失敗するはず
  const second = await bookReservation({
    ...base,
    newCustomer: { name: "検証用B" },
  });
  console.log(`2回目（同じ枠）: ${second.ok ? "成功してしまった" : `失敗（${second.message}）`}`);
  if (second.ok) created.push(second.reservationId);

  // 3回目：少しずらして重ねる。失敗するはず
  const third = await bookReservation({
    ...base,
    startMinutes: startMinutes + 15,
    newCustomer: { name: "検証用C" },
  });
  console.log(
    `3回目（15分ずらして重ねる）: ${third.ok ? "成功してしまった" : `失敗（${third.message}）`}`,
  );
  if (third.ok) created.push(third.reservationId);

  // 4回目：まだ空いている別の枠へ、同時に5件。1件だけ通るはず
  const after = await findAvailability({
    tenantId: tenant.id,
    date,
    menuId: menu.id,
    staffId,
  });
  const lastSlot = after.merged.at(-1);
  if (!lastSlot) throw new Error("同時実行の検証に使える空き枠がありません");

  console.log(`\n同時実行に使う枠: ${toHm(lastSlot.startMinutes)}`);
  const parallel = await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      bookReservation({
        ...base,
        startMinutes: lastSlot.startMinutes,
        newCustomer: { name: `同時${n}` },
      }),
    ),
  );
  const okCount = parallel.filter((r) => r.ok).length;
  for (const r of parallel) if (r.ok) created.push(r.reservationId);
  console.log(`4回目（同じ枠へ同時に5件）: 成功 ${okCount} 件 / 失敗 ${5 - okCount} 件`);

  const pass = first.ok && !second.ok && !third.ok && okCount === 1;
  console.log(`\n判定: ${pass ? "OK 二重予約は防げている" : "NG 見直しが必要"}`);

  // 後片付け
  const names = ["検証用A", "検証用B", "検証用C", "同時1", "同時2", "同時3", "同時4", "同時5"];
  await prisma.reservation.deleteMany({ where: { id: { in: created } } });
  const cs = await prisma.customer.findMany({
    where: { tenantId: tenant.id, name: { in: names } },
  });
  createdCustomers.push(...cs.map((c) => c.id));
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomers } } });
  console.log(`後片付け: 予約 ${created.length} 件 / 顧客 ${createdCustomers.length} 件を削除`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
