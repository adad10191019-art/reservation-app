/**
 * login-attempts.ts の古い記録の掃除（deleteStaleLoginAttempts）を開発用 DB で確かめる。
 *
 * 「掃除する時刻」を引数で未来にずらして、いま作った記録を古い記録として扱う。
 * 掃除は DB 全体が対象なので、開発用 DB にある古い失敗記録も一緒に消える
 * （開発用なので問題ない）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { deleteStaleLoginAttempts, recordFailure } from "./login-attempts";
import { prisma } from "./prisma";

const PREFIX = "db-test-login-attempts:";
const HOUR = 60 * 60 * 1000;

async function remaining(): Promise<string[]> {
  const rows = await prisma.loginAttempt.findMany({
    where: { email: { startsWith: PREFIX } },
    orderBy: { email: "asc" },
  });
  return rows.map((r) => r.email.slice(PREFIX.length));
}

afterEach(async () => {
  await prisma.loginAttempt.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

describe("deleteStaleLoginAttempts", () => {
  it("最後の失敗から24時間たっていない記録は残す", async () => {
    await recordFailure(`${PREFIX}recent`);

    await deleteStaleLoginAttempts(new Date(Date.now() + 23 * HOUR));

    expect(await remaining()).toEqual(["recent"]);
  });

  it("24時間以上たった記録は消す（ロックが切れたものも含む）", async () => {
    await recordFailure(`${PREFIX}stale`);
    // 5回失敗させてロックさせる（ロックは10分で切れる）
    for (let i = 0; i < 5; i++) await recordFailure(`${PREFIX}expired-lock`);

    const count = await deleteStaleLoginAttempts(new Date(Date.now() + 25 * HOUR));

    expect(await remaining()).toEqual([]);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("ロック中の記録は、古くても消さない", async () => {
    const now = new Date(Date.now() + 48 * HOUR);
    await prisma.loginAttempt.create({
      data: {
        email: `${PREFIX}locked`,
        failedCount: 5,
        lockedUntil: new Date(now.getTime() + 10 * 60 * 1000),
      },
    });
    await recordFailure(`${PREFIX}stale`);

    await deleteStaleLoginAttempts(now);

    expect(await remaining()).toEqual(["locked"]);
  });
});
