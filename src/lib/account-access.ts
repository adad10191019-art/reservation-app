/**
 * アカウントが「どの部署で・どの役割で」使えるかの判定。
 *
 * 1人1アカウントで、兼任の人は担当部署（Membership）が複数並ぶ。
 * ログイン状態（Cookie）には「今選んでいる部署」だけを入れ、役割やスタッフは
 * 毎回ここで DB の担当部署から決め直す（外された部署には、ログイン中でもすぐ入れなくなる）。
 *
 * DB も Cookie も触らない純粋な処理なので、そのままテストできる。
 */
import type { MemberSessionData, Role, SessionData } from "./session";

export type AccessUser = {
  id: string;
  email: string;
  isGroupAdmin: boolean;
  lastTenantId: string | null;
  employee: { name: string; isActive: boolean } | null;
  /** 古い順に並んでいること（最初のものを既定の部署にする） */
  memberships: {
    tenantId: string;
    role: string;
    staffId: string | null;
    staff: { name: string } | null;
  }[];
};

/** 担当部署が1つも無く、全社管理者でもない人（「全社の1日」だけを使う社員） */
export function isTeamOnly(user: AccessUser): boolean {
  return !user.isGroupAdmin && user.memberships.length === 0;
}

/**
 * 部署の画面を使うときのログイン状態の中身。その部署を使えなければ null。
 * tenantExists は全社管理者のときだけ見る（担当部署なら、部署が消えれば担当部署も消えている）。
 */
export function resolveDeptSession(
  user: AccessUser,
  tenantId: string,
  tenantExists: boolean,
): Omit<SessionData, "exp"> | null {
  const membership = user.memberships.find((m) => m.tenantId === tenantId) ?? null;
  const name = membership?.staff?.name ?? user.employee?.name ?? user.email;

  if (user.isGroupAdmin) {
    if (!tenantExists) return null;
    // 全社管理者がその部署のスタッフも兼ねていれば、自分の予定を使えるようにスタッフも持たせる
    return { userId: user.id, tenantId, role: "group_admin", staffId: membership?.staffId ?? null, name };
  }

  if (!membership) return null;
  if (membership.role !== "owner" && membership.role !== "staff") return null;
  return {
    userId: user.id,
    tenantId,
    role: membership.role as Role,
    staffId: membership.staffId,
    name,
  };
}

/** 担当部署の無い社員のログイン状態の中身。名簿で在籍中の人にひも付いていなければ null */
export function resolveMemberSession(user: AccessUser): Omit<MemberSessionData, "exp"> | null {
  if (!isTeamOnly(user)) return null;
  if (!user.employee?.isActive) return null;
  return { userId: user.id, tenantId: null, role: "member", staffId: null, name: user.employee.name };
}

/**
 * パスワードを初期状態に戻してよいか。
 * 戻した人は初期パスワード（＝メールアドレス）でそのアカウントに入れてしまうので、
 * 自分が持っていない権限を持つアカウントには使わせない。
 *   ・全社管理者は誰でも
 *   ・オーナーは、今の部署だけを担当している人（全社管理者を除く）だけ
 */
export function canResetPassword(
  actor: { role: string; tenantId: string },
  target: { isGroupAdmin: boolean; memberships: { tenantId: string }[] },
): boolean {
  if (actor.role === "group_admin") return true;
  if (actor.role !== "owner" || target.isGroupAdmin) return false;
  return (
    target.memberships.length > 0 && target.memberships.every((m) => m.tenantId === actor.tenantId)
  );
}

/**
 * ログインしたときに開く部署。前回選んでいた部署がまだ使えればそこ、
 * 無ければ最初の担当部署（全社管理者で担当部署も無ければ、一番古い部署）。
 * どこも使えなければ null。
 */
export function pickLoginTenant(user: AccessUser, allTenantIdsOldestFirst: string[]): string | null {
  const usable = user.isGroupAdmin
    ? allTenantIdsOldestFirst
    : user.memberships.map((m) => m.tenantId);
  if (user.lastTenantId && usable.includes(user.lastTenantId)) return user.lastTenantId;
  if (user.isGroupAdmin && user.memberships.length > 0) {
    const first = user.memberships.find((m) => usable.includes(m.tenantId));
    if (first) return first.tenantId;
  }
  return usable[0] ?? null;
}
