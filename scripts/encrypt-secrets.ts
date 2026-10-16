/**
 * DB に平文で残っている秘密の情報（LINE・Google の鍵）を暗号化する。
 *
 *   npm run db:encrypt-secrets
 *
 * 暗号化を入れる前に保存された値の移し替えと、鍵を入れ替えたあとのかけ直しに使う
 * （中身は src/lib/secret-migration.ts）。何度流しても結果は同じ。
 * 本番に流すときは、DATABASE_URL と DATA_ENCRYPTION_KEY を本番のものにする。
 * 鍵が本番の Vercel に登録したものと違うと、本番のアプリが読めなくなるので注意。
 * 鍵そのものや秘密の値は画面に出さない。
 */
import "dotenv/config";
import { productionTargets } from "../src/lib/db-target";
import { prisma } from "../src/lib/prisma";
import { countUnsealedSecrets, encryptStoredSecrets } from "../src/lib/secret-migration";

async function main() {
  if (!process.env.DATA_ENCRYPTION_KEY) {
    console.error("DATA_ENCRYPTION_KEY が設定されていません。中止しました。");
    process.exit(1);
  }
  const host = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "未設定";
  const isProduction = productionTargets(process.env).length > 0;
  console.log(`接続先：${host}（${isProduction ? "本番" : "開発用"}）`);

  const before = await countUnsealedSecrets(prisma);
  console.log(`暗号化されていない値：${before}件`);

  const result = await encryptStoredSecrets(prisma);
  console.log(`暗号化した値：店舗の LINE ${result.tenantFields}件、Google ${result.googleFields}件`);

  const after = await countUnsealedSecrets(prisma);
  console.log(`暗号化されていない値（流したあと）：${after}件`);
  if (after > 0) {
    console.error("まだ残っています。もう一度流してください（流している間に画面から保存された可能性があります）。");
    process.exit(1);
  }
  console.log("完了しました。");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
