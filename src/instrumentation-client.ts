/**
 * ブラウザ側（お客様の予約画面・スタッフの操作画面）で起きたエラーを
 * Sentryに送る設定。
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://8620f3ccc13f7cf8769ff461f67c3245@o4512161856028672.ingest.us.sentry.io/4512161863172096",
  tracesSampleRate: 0,
});
