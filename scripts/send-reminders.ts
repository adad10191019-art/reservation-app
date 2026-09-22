/**
 * 前日リマインドを送る。
 *
 *   npm run remind            … 明日の予約に送る
 *   npm run remind 2026-09-24 … 日付を指定して送る
 *
 * 毎日決まった時刻に動かす想定。公開先の定時実行（Vercel Cron など）から呼ぶ。
 * 送信済みの予約は飛ばすので、1日に何度動かしても二重に送られない。
 */
import "dotenv/config";
import { sendRemindersFor } from "../src/lib/notify";
import { prisma } from "../src/lib/prisma";
import { addDays, formatDateLabel, todayString } from "../src/lib/time";

async function main() {
  const arg = process.argv[2];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(arg ?? "") ? arg : addDays(todayString(), 1);

  // アクセストークンは店舗ごとに持てるため、ここでは一括では判定しない。
  // 未設定の店舗の分は、下の結果に理由付きで「未送信」と出る。
  console.log(`対象: ${formatDateLabel(date)}\n`);

  const outcomes = await sendRemindersFor(date);

  if (outcomes.length === 0) {
    console.log("送る相手がいません（LINEに紐づいた予約がない、または送信済み）");
    return;
  }

  let sent = 0;
  for (const o of outcomes) {
    if (o.sent) sent++;
    console.log(`${o.sent ? "送信" : "未送信"} ${o.customerName} 様${o.reason ? ` — ${o.reason}` : ""}`);
  }

  console.log(`\n送信 ${sent} 件 / 対象 ${outcomes.length} 件`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
