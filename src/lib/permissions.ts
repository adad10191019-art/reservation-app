/**
 * 誰が何をしてよいかの判定。
 *
 * DBもCookieも触らない純粋な判定だけを置く。そのままテストできる。
 *
 * 方針
 *   オーナー … 店舗の予約をすべて操作できる
 *   スタッフ … カレンダーは全員分を見られる（店舗の状況把握に必要）が、
 *              予約を登録・変更・キャンセルできるのは自分の担当分だけ
 */
import type { Role } from "./session";

export type Actor = {
  role: Role;
  /** スタッフ本人のアカウントなら、そのスタッフID */
  staffId: string | null;
};

/** その担当分の予約を操作してよいか */
export function canManageStaffReservation(actor: Actor, staffId: string): boolean {
  // オーナー、および今その部署を選んでいる group_admin はすべて操作できる
  if (actor.role === "owner" || actor.role === "group_admin") return true;
  // スタッフ本人に紐づいていないアカウントは、誰の予約も操作できない
  if (!actor.staffId) return false;
  return actor.staffId === staffId;
}

/** 設定（スタッフ・メニュー・営業時間）を変更してよいか */
export function canEditSettings(actor: Actor): boolean {
  return actor.role === "owner" || actor.role === "group_admin";
}

/** 操作できなかったときの説明 */
export function denyMessage(actor: Actor): string {
  if (!actor.staffId) {
    return "このアカウントはスタッフに紐づいていないため、予約を操作できません";
  }
  return "自分の担当分の予約のみ操作できます";
}
