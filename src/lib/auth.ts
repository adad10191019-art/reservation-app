/**
 * ログインしている人の取り出しと、権限の判定。
 *
 * Cookie を読むためサーバー側でしか使えない。
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type AccessUser, resolveDeptSession, resolveMemberSession } from "./account-access";
import { prisma } from "./prisma";
import {
  type AnySession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionData,
  buildSession,
  decodeSession,
  encodeSession,
} from "./session";

/** 最初のパスワード変更の画面。発行したままのアカウントは、ここ以外を開けない */
export const FIRST_PASSWORD_PATH = "/account/first-password";

/** ログインしていなければ null（社員ログインも含む。中身はまだ DB で確かめていない） */
export async function getSession(): Promise<AnySession | null> {
  // Next.js 16 では cookies() は Promise
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

/** 担当部署の判定に要る形でアカウントを読む */
export async function loadAccessUser(where: { id: string } | { email: string }) {
  return prisma.user.findUnique({
    where,
    include: {
      employee: { select: { name: true, isActive: true } },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: { tenantId: true, role: true, staffId: true, staff: { select: { name: true } } },
      },
    },
  });
}

/**
 * Cookie を読み、そのアカウントと「今選んでいる部署」を今も使えるかDBで確かめる。
 *
 * Cookie は「誰であるか」と「どの部署を選んでいるか」の証明にだけ使い、
 * 「その部署で何ができるか」は毎回DBの担当部署から決める。
 *   ・権限を変えた結果が、ログインし直さなくてもすぐ効く
 *   ・削除されたアカウントや、外された部署・無くなった部署のログインを弾ける
 *
 * 画面の描画中には Cookie を書き換えられないため、
 * ここでは消さずに「未ログイン」として返すだけにする。
 * 古い Cookie は、次にログインしたときに上書きされる。
 */
async function verify(): Promise<{ session: AnySession; mustChangePassword: boolean } | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await loadAccessUser({ id: session.userId });
  if (!user) return null;

  if (session.role === "member") {
    // 担当部署が付いた・全社管理者になった、なら部署の画面を使えるようログインし直してもらう
    const member = resolveMemberSession(user);
    return member ? { session: { ...session, ...member }, mustChangePassword: user.mustChangePassword } : null;
  }

  const tenantExists = user.isGroupAdmin
    ? Boolean(await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { id: true } }))
    : true;
  const dept = resolveDeptSession(user, session.tenantId, tenantExists);
  return dept ? { session: { ...session, ...dept }, mustChangePassword: user.mustChangePassword } : null;
}

export async function getVerifiedAnySession(): Promise<AnySession | null> {
  return (await verify())?.session ?? null;
}

/** 部署の画面を使う人（オーナー・スタッフ・全社管理者）のログイン。社員ログインは null */
export async function getVerifiedSession(): Promise<SessionData | null> {
  const session = await getVerifiedAnySession();
  return session && session.role !== "member" ? session : null;
}

/**
 * ログインしていなければログイン画面へ、初期パスワードのままなら変更の画面へ送る。
 * 変更の画面そのもの（とその保存）だけは、初期パスワードのままでも通す。
 */
async function requireVerified(allowInitialPassword = false): Promise<AnySession> {
  const verified = await verify();
  if (!verified) redirect("/login");
  if (verified.mustChangePassword && !allowInitialPassword) redirect(FIRST_PASSWORD_PATH);
  return verified.session;
}

/**
 * 部署の画面の入口。ログインしていなければログイン画面へ、
 * 社員ログイン（部署に属さない人）なら使える唯一の画面「全社の1日」へ送る。
 */
export async function requireSession(): Promise<SessionData> {
  const session = await requireVerified();
  if (session.role === "member") redirect("/team");
  return session;
}

/** 「全社の1日」とアカウント情報の入口。社員ログインも通す */
export async function requireTeamSession(): Promise<AnySession> {
  return requireVerified();
}

/** 最初のパスワード変更の画面とその保存だけが使う入口 */
export async function requireSessionForFirstPassword(): Promise<AnySession> {
  return requireVerified(true);
}

/** オーナー（または全部署を横断できる group_admin）でなければ追い返す */
export async function requireOwner(): Promise<SessionData> {
  const session = await requireSession();
  if (session.role !== "owner" && session.role !== "group_admin") {
    // 日本語をそのままURLに入れると Location ヘッダーに載せられない
    redirect(`/calendar?error=${encodeURIComponent("この操作はオーナーのみです")}`);
  }
  return session;
}

/** 全部署を横断できる group_admin でなければ追い返す（部署の追加・編集など） */
export async function requireGroupAdmin(): Promise<SessionData> {
  const session = await requireSession();
  if (session.role !== "group_admin") {
    redirect(`/calendar?error=${encodeURIComponent("この操作は全社管理者のみです")}`);
  }
  return session;
}

export async function startSession(data: AnySession): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(data), {
    httpOnly: true, // JavaScript から読めなくする（盗まれにくくする）
    sameSite: "lax", // 他サイトからの送信を防ぐ
    secure: process.env.NODE_ENV === "production", // 公開時は HTTPS のみ
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * その部署を選んだログイン状態に切り替え、次のログインでもその部署を開くよう覚えておく。
 * その部署を使えなければ何もせず false を返す。
 */
export async function startDeptSession(user: AccessUser, tenantId: string): Promise<boolean> {
  const tenantExists = Boolean(
    await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
  );
  const dept = resolveDeptSession(user, tenantId, tenantExists);
  if (!dept) return false;
  await startSession(buildSession(dept));
  await prisma.user.update({ where: { id: user.id }, data: { lastTenantId: tenantId } });
  return true;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
