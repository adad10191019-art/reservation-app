/**
 * DB テストの最初に必ず走る確認。
 *
 * テストは開発用の DB に書き込み、後片付けで消す。本番に向いたまま流すと
 * 本番にテスト用の店舗ができてしまうので、本番のホストなら1件も流さずに止める。
 *
 * .env は実行したフォルダのものを読む。別の場所の .env を使うときは
 * DOTENV_CONFIG_PATH で指定する（dotenv の機能）。
 */
import "dotenv/config";
import { productionTargets } from "@/lib/db-target";

const hits = productionTargets(process.env);
if (hits.length > 0) {
  const list = hits.map((h) => `${h.name}=${h.host}`).join(", ");
  throw new Error(`本番の DB を向いているので DB テストを中止しました（${list}）`);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL が設定されていません。開発用の .env を用意してください");
}
