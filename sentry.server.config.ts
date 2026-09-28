/**
 * サーバー側（API・Server Actions）のエラーをSentryに送る設定。
 * ここが一番価値が大きい。予約処理・通知処理などのバグは
 * ほぼ必ずサーバー側で起きるため。
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://8620f3ccc13f7cf8769ff461f67c3245@o4512161856028672.ingest.us.sentry.io/4512161863172096",

  // 無料枠を節約するため、パフォーマンストレースは送らない（エラーだけで十分）
  tracesSampleRate: 0,
});
