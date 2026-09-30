/**
 * DB を丸ごと作り直すコマンド（db:seed / db:reset）の前に走らせる安全装置。
 *
 * 本番の接続先を読み込んだまま seed を流すと、最初の deleteMany で本番の
 * 予約・顧客がすべて消えるため、接続先が本番のホストなら何もせずに止める。
 * 本番かどうかの判定は src/lib/db-target.ts（DB テストと共通）。
 */
import "dotenv/config";
import { productionTargets } from "../src/lib/db-target";

const hits = productionTargets(process.env);
if (hits.length > 0) {
  for (const { name, host } of hits) {
    console.error(`${name} が本番の DB（${host}）を向いているので中止しました。`);
  }
  console.error("seed / reset は開発用の DB でだけ実行してください。");
  process.exit(1);
}
