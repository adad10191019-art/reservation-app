/**
 * ログインしている人の取り出しと、権限の判定。
 *
 * Cookie を読むためサーバー側でしか使えない。
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import {
  type AnySession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type Role,
  type SessionData,
  decodeSession,
  encodeSession,
} from "./session";

/** ログインしていなければ null（社員ログインも含む。中身はまだ DB で確かめていない） */
export async function getSession(): Promise<AnySession | null> {
  // Next.js 16 では cookies() は Promise
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Cookie を読み、そのアカウントが今も実在するかDBで確かめる。
 *
 * Cookie は「誰であるか」の証明にだけ使い、「何ができるか」は毎回DBを見る。
 *   ・権限を変えた結果が、ログインし直さなくてもすぐ効く
 *   ・削除されたアカウントや、無くなった店舗のログインを弾ける
 *
 * 画面の描画中には Cookie を書き換えられないため、
 * ここでは消さずに「未ログイン」として返すだけにする。
 * 古い Cookie は、次にログインしたときに上書きされる。
 */
export async function getVerifiedAnySession(): Promise<AnySession | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { staff: true, employee: true },
  });
  if (!user) return null;

  // 社員（member）は、名簿で在籍中の人にひも付いている間だけ有効。
  // Cookie と DB の役割が食い違えば（社員⇔部署のアカウント）、ログインし直してもらう
  if (user.role === "member" || session.role === "member") {
    if (user.role !== "member" || session.role !== "member") return null;
    if (!user.employee?.isActive) return null;
    return { ...session, name: user.employee.name };
  }

  // group_admin は特定の部署に属さない。Cookie が指す「今選んでいる部署」が
  // 今も実在するかだけを確かめる（部署の切り替えは switchTenant で行う）。
  if (user.role === "group_admin") {
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
    if (!tenant) return null;

    return { ...session, role: "group_admin", staffId: null, name: user.email };
  }

  // owner / staff は自分の所属部署以外を名乗れない
  if (user.tenantId !== session.tenantId) return null;

  return {
    ...session,
    role: user.role as Role,
    staffId: user.staffId,
    name: user.staff?.name ?? user.email,
  };
}

/** 部署の画面を使う人（オーナー・スタッフ・全社管理者）のログイン。社員ログインは null */
export async function getVerifiedSession(): Promise<SessionData | null> {
  const session = await getVerifiedAnySession();
  return session && session.role !== "member" ? session : null;
}

/**
 * 部署の画面の入口。ログインしていなければログイン画面へ、
 * 社員ログイン（部署に属さない人）なら使える唯一の画面「全社の1日」へ送る。
 */
export async function requireSession(): Promise<SessionData> {
  const session = await getVerifiedAnySession();
  if (!session) redirect("/login");
  if (session.role === "member") redirect("/team");
  return session;
}

/** 「全社の1日」とアカウント情報の入口。社員ログインも通す */
export async function requireTeamSession(): Promise<AnySession> {
  const session = await getVerifiedAnySession();
  if (!session) redirect("/login");
  return session;
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

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
