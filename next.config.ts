import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DBのドライバはネイティブモジュールを含むため、
  // バンドルに取り込まず、実行時にそのまま読み込ませる。
  // これを外すと公開先でのビルドが落ちることがある。
  serverExternalPackages: [
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
    "@prisma/adapter-pg",
    "pg",
  ],
};

export default nextConfig;
