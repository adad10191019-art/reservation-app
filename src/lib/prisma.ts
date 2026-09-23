import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * DB接続。PostgreSQL（Neon）専用。
 *
 * 以前は DATABASE_URL の書き出し（file: か postgres:// か）を見て
 * SQLite と切り替えていたが、PostgreSQL へ完全に移行済み。
 * schema.prisma の provider も "postgresql" 固定になっているため、
 * 今 DATABASE_URL に file: を指定しても動かない（生成されたクライアントが
 * PostgreSQL 向けの SQL しか話さないため）。
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が設定されていません");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

// Next.js の開発中はファイル変更のたびに再読み込みが走るため、
// そのたびに接続を作ると接続が増え続ける。グローバルに1つだけ持たせて使い回す。
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
