/**
 * Edge Runtime（ミドルウェアなど）で動く部分のエラーをSentryに送る設定。
 * このアプリでは今のところEdge Runtimeを積極的には使っていないが、
 * Next.jsの型上は必要になるため用意しておく。
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://8620f3ccc13f7cf8769ff461f67c3245@o4512161856028672.ingest.us.sentry.io/4512161863172096",
  tracesSampleRate: 0,
});
