import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * DB接続。
 *
 * 接続先は DATABASE_URL の書き出しで判断する。
 *   file:...        → SQLite（手元での開発用）
 *   postgres://...  → PostgreSQL（公開したとき用）
 *
 * Prisma 7 からはドライバアダプタが必須になったため、
 * どちらを使うかをここで切り替える。
 *
 * ※ 公開時は prisma/schema.prisma の provider も "postgresql" に変える必要がある。
 *    手順は README の「PostgreSQL へ切り替える」を参照。
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isPostgres(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";

  const adapter = isPostgres(url)
    ? new PrismaPg({ connectionString: url })
    : new PrismaBetterSqlite3({ url });

  return new PrismaClient({ adapter });
}

// Next.js の開発中はファイル変更のたびに再読み込みが走るため、
// そのたびに接続を作ると接続が増え続ける。グローバルに1つだけ持たせて使い回す。
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
