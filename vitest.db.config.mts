import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * DB を使うテスト（*.db.test.ts）の設定。npm run test:db で流す。
 *
 * 開発用の DB に本物のデータを書き込むので、
 *   ・最初に接続先が本番でないかを確かめる（src/test/db-setup.ts）
 *   ・テストごとに専用の店舗を作り、終わったら店舗ごと消す（src/test/db-fixture.ts）
 * ファイル同士を同時に走らせると、リマインドのように日付で全店舗を
 * まとめて見る処理が互いのデータを拾うので、1ファイルずつ順に流す。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    setupFiles: ["./src/test/db-setup.ts"],
    fileParallelism: false,
    // Neon は起動直後の1回目が遅いことがある
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
