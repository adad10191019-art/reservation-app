/**
 * 前日リマインドの定時実行。Vercel Cron が毎日呼ぶ（vercel.json に時刻を書く）。
 *
 * 明日の予約のうち、LINEに紐づいたお客様へリマインドを送る。
 * 送信済みの予約は飛ばすので、二重に呼ばれても同じ人に2通は届かない。
 * 手元から送りたいときは、これまで通り `npm run remind` も使える。
 *
 * ついでに、古いログイン失敗の記録も消す（1日1回で足りるので相乗りさせる）。
 */
import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { deleteStaleLoginAttempts } from "@/lib/login-attempts";
import { sendRemindersFor } from "@/lib/notify";
import { addDays, todayString } from "@/lib/time";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 日本時間での「明日」（サーバーのタイムゾーンには左右されない）
  const date = addDays(todayString(), 1);
  const outcomes = await sendRemindersFor(date);

  const sent = outcomes.filter((o) => o.sent).length;
  const failed = outcomes.filter((o) => !o.sent);

  // Vercel のログで後から確かめられるよう、送れなかった分は理由を残す。
  // お客様の名前は出さず、予約IDだけにする
  console.log(`[前日リマインド] ${date} 送信 ${sent} 件 / 対象 ${outcomes.length} 件`);
  for (const o of failed) {
    console.log(`[前日リマインド] 未送信 予約ID=${o.reservationId} ${o.reason ?? ""}`);
  }

  // 掃除に失敗してもリマインドの結果は返す（次の日にまた消せばよい）
  let deletedLoginAttempts: number | null = null;
  try {
    deletedLoginAttempts = await deleteStaleLoginAttempts();
    console.log(`[ログイン失敗の掃除] ${deletedLoginAttempts} 件を削除`);
  } catch (e) {
    console.error("[ログイン失敗の掃除] 失敗", e);
  }

  return NextResponse.json({
    date,
    total: outcomes.length,
    sent,
    failed: failed.length,
    deletedLoginAttempts,
  });
}
