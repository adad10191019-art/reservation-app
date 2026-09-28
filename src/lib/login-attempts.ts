/**
 * ログインの総当たり攻撃対策。
 *
 * 同じメールアドレスへの失敗が続いたら、しばらくの間そのアドレスへの
 * ログインを受け付けない。メールアドレスは部署ごとに重複しうるが、
 * 試みる側はどの部署のアカウントかを知らずに打ち込むので、入力された
 * 文字列そのものをキーにして部署をまたいでまとめて数える。
 *
 * 失敗のたびに毎回書き込むだけの単純な仕組みなので、極端に速い連打には
 * 弱いが、パスワードを推測しようとする総当たりの速度を大きく落とせれば
 * 十分という前提。
 */
import { prisma } from "./prisma";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 10;

/** ロック中なら true。期限切れのロックはここで自動的に解除する */
export async function isLocked(email: string): Promise<boolean> {
  const record = await prisma.loginAttempt.findUnique({ where: { email } });
  if (!record?.lockedUntil) return false;

  if (record.lockedUntil > new Date()) return true;

  // 期限切れ：カウントごとリセットしておく（次の失敗からまた数え直す）
  await prisma.loginAttempt.update({
    where: { email },
    data: { failedCount: 0, lockedUntil: null },
  });
  return false;
}

/** 失敗を1回記録する。上限に達したらロックする */
export async function recordFailure(email: string): Promise<void> {
  const record = await prisma.loginAttempt.upsert({
    where: { email },
    create: { email, failedCount: 1 },
    update: { failedCount: { increment: 1 } },
  });

  if (record.failedCount >= MAX_ATTEMPTS) {
    await prisma.loginAttempt.update({
      where: { email },
      data: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) },
    });
  }
}

/** ログインに成功したら、それまでの失敗記録を消す */
export async function recordSuccess(email: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { email } });
}
