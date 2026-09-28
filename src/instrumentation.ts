/**
 * Next.js が起動時に自動で呼ぶ場所。実行環境（Node / Edge）に応じて
 * 対応するSentryの設定ファイルを読み込む。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = async (
  ...args: Parameters<Awaited<typeof import("@sentry/nextjs")>["captureRequestError"]>
) => {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
