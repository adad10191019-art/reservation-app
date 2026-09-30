import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // DBのドライバはネイティブモジュールを含むため、
  // バンドルに取り込まず、実行時にそのまま読み込ませる。
  // これを外すと公開先でのビルドが落ちることがある。
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
};

export default withSentryConfig(nextConfig, {
  org: "youth-personnel",
  project: "reservation-app",
  // ソースマップのアップロードには認証トークンが要る。
  // 未設定の間はアップロードをスキップするだけで、エラー監視自体は動く
  silent: true,
});
