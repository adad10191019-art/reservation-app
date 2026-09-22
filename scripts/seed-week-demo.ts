/**
 * 直近1週間を、スタッフ・時間帯バラバラに5割程度埋めるデモ用データ。
 *
 *   npm run db:demo-week
 *
 * 実際の予約登録ロジック（bookReservation）を通すので、二重予約にならず、
 * 料金・所要時間のスナップショットも本番と同じ形で作られる。
 * 何度実行しても、その回の分をまず消してから作り直す（積み増しにならない）。
 *
 * 対象は "sample-salon"（サンプルヘアサロン）のみ。他店舗には触れない。
 */
import "dotenv/config";
import { bookReservation } from "../src/lib/booking";
import { findAvailability } from "../src/lib/availability";
import { prisma } from "../src/lib/prisma";
import { addDays, todayString } from "../src/lib/time";

/** 配列からランダムに1件選ぶ */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "sample-salon" } });
  if (!tenant) throw new Error("sample-salon が見つかりません。先に npm run db:seed してください");

  const dates = Array.from({ length: 7 }, (_, i) => addDays(todayString(), i));

  // このスクリプトが前回作った分だけを消す（メモに印を付けて見分ける）
  const MARK = "[demo-week]";
  const removed = await prisma.reservation.deleteMany({
    where: { tenantId: tenant.id, date: { in: dates }, customer: { note: MARK } },
  });
  console.log(`前回ぶんを削除: ${removed.count}件`);

  const staffs = await prisma.staff.findMany({
    where: { tenantId: tenant.id, isActive: true },
  });
  const menus = await prisma.menu.findMany({
    where: { tenantId: tenant.id, isActive: true },
  });

  // デモ用の客をまとめて作る（同じ名前で何度も流すと増殖するので、無ければ作る）
  const customerNames = [
    "鈴木 一郎",
    "高橋 直子",
    "渡辺 健太",
    "中村 優子",
    "小川 真由",
    "森田 大輔",
  ];
  const customers = [];
  for (const name of customerNames) {
    const existing = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, name, note: MARK },
    });
    customers.push(
      existing ??
        (await prisma.customer.create({
          data: {
            tenantId: tenant.id,
            name,
            phone: `090-${String(1000 + customers.length).padStart(4, "0")}-${String(
              2000 + customers.length,
            ).padStart(4, "0")}`,
            note: MARK,
          },
        })),
    );
  }

  const actor = { role: "owner" as const, staffId: null };
  let created = 0;

  for (const date of dates) {
    for (const staff of staffs) {
      // このスタッフが対応できるメニューだけを対象にする
      const staffMenuIds = new Set(
        (
          await prisma.staffMenu.findMany({
            where: { tenantId: tenant.id, staffId: staff.id },
            select: { menuId: true },
          })
        ).map((m) => m.menuId),
      );
      const candidateMenus = menus.filter((m) => staffMenuIds.has(m.id));
      if (candidateMenus.length === 0) continue;

      // その日その人に、ざっくり半分くらい埋まる見た目になるまで、
      // ランダムなメニューで空きを探しては埋める（バラバラな時間・メニューにする）
      const attempts = 4; // 目安の件数。空きが無ければ自然と途中で止まる
      for (let i = 0; i < attempts; i++) {
        const menu = pick(candidateMenus);
        const availability = await findAvailability({
          tenantId: tenant.id,
          date,
          menuId: menu.id,
          staffId: staff.id,
        });
        const starts = availability.perStaff[0]?.starts ?? [];
        if (starts.length === 0) continue;

        const startMinutes = pick(starts);
        const customer = pick(customers);

        const result = await bookReservation({
          actor,
          tenantId: tenant.id,
          date,
          menuId: menu.id,
          staffId: staff.id,
          startMinutes,
          customerId: customer.id,
        });

        if (result.ok) {
          created++;
        }
        // 失敗（他の候補と偶然ぶつかった等）は無視して次へ進む
      }
    }
  }

  console.log(`作成: ${created}件（${dates[0]} 〜 ${dates[6]}）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
