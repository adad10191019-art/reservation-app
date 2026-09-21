/**
 * 実際のDBを使って空き枠を出し、目で確認するためのスクリプト。
 * テストは純粋な計算を検証する。こちらは「DBから正しく値を渡せているか」を見る。
 *
 *   npm run check
 */
import "dotenv/config";
import { findAvailability } from "../src/lib/availability";
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

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

function label(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${date}(${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { name: "サンプルヘアサロン" },
  });
  if (!tenant) throw new Error("ダミーデータがありません。npm run db:seed を先に実行してください");

  const menus = await prisma.menu.findMany({
    where: { tenantId: tenant.id },
    orderBy: { durationMinutes: "asc" },
  });

  const staffNames = new Map(
    (await prisma.staff.findMany({ where: { tenantId: tenant.id } })).map((s) => [
      s.id,
      s.name,
    ]),
  );

  for (const menu of [menus.find((m) => m.name === "ヘッドスパ")!, menus.find((m) => m.name === "カット")!]) {
    console.log(
      `\n=== ${menu.name}（${menu.durationMinutes}分 + 片付け${menu.bufferMinutes}分 = ${menu.durationMinutes + menu.bufferMinutes}分）===`,
    );

    for (const offset of [0, 1, 2, 3, 5]) {
      const date = dateStr(offset);
      const result = await findAvailability({
        tenantId: tenant.id,
        date,
        menuId: menu.id,
      });

      console.log(`\n[${label(date)}]`);
      if (result.perStaff.length === 0) {
        console.log("  このメニューを担当できるスタッフがいません");
        continue;
      }

      for (const s of result.perStaff) {
        const times = s.starts.map(toHm);
        const shown =
          times.length === 0
            ? "空きなし"
            : times.length <= 8
              ? times.join(" ")
              : `${times.slice(0, 6).join(" ")} … 他${times.length - 6}件`;
        console.log(`  ${s.staffName.padEnd(4, "　")} : ${shown}`);
      }

      const e = result.earliest;
      console.log(
        `  → 誰でもいいので最短: ${
          e ? `${toHm(e.startMinutes)}（${e.staffIds.map((id) => staffNames.get(id)).join("・")}）` : "なし"
        }`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
