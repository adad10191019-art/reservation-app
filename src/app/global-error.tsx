"use client";

/**
 * 画面の描画中に起きた、キャッチしきれないエラーをSentryに送る。
 * Next.js の仕様で、これは <html> ごと自前で描画する必要がある。
 */
import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
