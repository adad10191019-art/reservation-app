/**
 * DB を丸ごと作り直すコマンド（db:seed / db:reset）の前に走らせる安全装置。
 *
 * 開発用と本番用は Neon の別ブランチに分けてあり、手元の .env は開発用
 * （development ブランチ）を向いている。本番の接続先を読み込んだまま seed を
 * 流すと、最初の deleteMany で本番の予約・顧客がすべて消えるため、
 * 接続先が本番のホストなら何もせずに止める。
 *
 * 本番ブランチのコンピュートを作り直してホスト名が変わったら、ここも直す。
 */
import "dotenv/config";

const PRODUCTION_HOST_PREFIX = "ep-orange-pond-b3d859bd";

for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
  const url = process.env[name];
  if (!url) continue;

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    continue;
  }

  if (host.startsWith(PRODUCTION_HOST_PREFIX)) {
    console.error(`${name} が本番の DB（${host}）を向いているので中止しました。`);
    console.error("seed / reset は開発用の DB でだけ実行してください。");
    process.exit(1);
  }
}
