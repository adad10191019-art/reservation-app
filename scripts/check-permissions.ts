/**
 * 権限がサーバー側で効いているかを、実際のDBで確かめるスクリプト。
 *
 *   npm run check:perm
 *
 * 画面でボタンを隠すだけでは守りにならない。フォームは直接送れるため、
 * 処理そのものが拒否することを確かめる必要がある。
 *
 * 変更したものは最後に元へ戻す。
 */
import "dotenv/config";
import {
  bookReservation,
  rescheduleReservation,
  setReservationStatus,
} from "../src/lib/booking";
import type { Actor } from "../src/lib/permissions";
import { prisma } from "../src/lib/prisma";
import { toHm } from "../src/lib/time";

function line(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "OK " : "NG "} ${label}: ${detail}`);
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) throw new Error("ダミーデータがありません。npm run db:seed を実行してください");

  const sato = await prisma.staff.findFirst({ where: { tenantId: tenant.id, name: "佐藤" } });
  const suzuki = await prisma.staff.findFirst({ where: { tenantId: tenant.id, name: "鈴木" } });
  if (!sato || !suzuki) throw new Error("スタッフが見つかりません");

  // 鈴木が担当する予約を1件選ぶ
  const target = await prisma.reservation.findFirst({
    where: { tenantId: tenant.id, staffId: suzuki.id, status: "booked" },
  });
  if (!target) throw new Error("鈴木の予約が見つかりません");

  const satoActor: Actor = { role: "staff", staffId: sato.id };
  const ownerActor: Actor = { role: "owner", staffId: null };
  const detachedActor: Actor = { role: "staff", staffId: null };

  console.log(
    `対象: ${target.date} ${toHm(target.startMinutes)} ${target.menuNameSnapshot}（担当 鈴木）\n`,
  );

  const results: boolean[] = [];

  // 1. 佐藤が鈴木の予約をキャンセルしようとする → 拒否されるはず
  const r1 = await setReservationStatus({
    actor: satoActor,
    tenantId: tenant.id,
    reservationId: target.id,
    status: "canceled",
  });
  results.push(!r1.ok);
  line("他人の予約をキャンセル", !r1.ok, r1.ok ? "通ってしまった" : r1.message);

  // 2. 佐藤が鈴木の予約を自分に付け替えようとする → 拒否されるはず
  const r2 = await rescheduleReservation({
    actor: satoActor,
    tenantId: tenant.id,
    reservationId: target.id,
    date: target.date,
    staffId: sato.id, // 自分に付け替える
    startMinutes: target.startMinutes,
  });
  results.push(!r2.ok);
  line("他人の予約を自分に付け替え", !r2.ok, r2.ok ? "通ってしまった" : r2.message);

  // 3. 佐藤が鈴木の担当として予約を登録しようとする → 拒否されるはず
  const r3 = await bookReservation({
    actor: satoActor,
    tenantId: tenant.id,
    date: target.date,
    menuId: target.menuId,
    staffId: suzuki.id,
    startMinutes: target.startMinutes,
    newCustomer: { name: "権限検証" },
  });
  results.push(!r3.ok);
  line("他人の担当で予約を登録", !r3.ok, r3.ok ? "通ってしまった" : r3.message);

  // 4. スタッフに紐づかないアカウント → 拒否されるはず
  const r4 = await setReservationStatus({
    actor: detachedActor,
    tenantId: tenant.id,
    reservationId: target.id,
    status: "canceled",
  });
  results.push(!r4.ok);
  line("スタッフ未紐づけのアカウント", !r4.ok, r4.ok ? "通ってしまった" : r4.message);

  // 5. オーナーなら通るはず（確認後すぐ戻す）
  const r5 = await setReservationStatus({
    actor: ownerActor,
    tenantId: tenant.id,
    reservationId: target.id,
    status: "canceled",
  });
  results.push(r5.ok);
  line("オーナーが他人の予約を操作", r5.ok, r5.ok ? "通った（正常）" : r5.message);

  if (r5.ok) {
    await prisma.reservation.update({
      where: { id: target.id },
      data: { status: "booked", canceledAt: null },
    });
    console.log("   → 元の状態に戻した");
  }

  // 後片付け（3が万一通っていた場合に備えて）
  const leftovers = await prisma.customer.findMany({
    where: { tenantId: tenant.id, name: "権限検証" },
  });
  if (leftovers.length > 0) {
    const ids = leftovers.map((c) => c.id);
    await prisma.reservation.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    console.log(`   → 検証用データを削除（${leftovers.length}件）`);
  }

  const allPassed = results.every(Boolean);
  console.log(`\n判定: ${allPassed ? "OK 権限はサーバー側で効いている" : "NG 見直しが必要"}`);
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
