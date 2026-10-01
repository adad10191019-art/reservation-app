/**
 * 設定→メンバー（1人＝名簿の人＋ログイン＋部署ごとの担当）の、DB を使わない判断。
 * 実際の書き込みは member-actions.ts、画面は src/app/settings/members。
 *
 * 1人のメンバーは次の組み合わせでできている。
 *   ・Employee（名簿の人。名前・在籍。会社全体で1人1つ）
 *   ・User（ログイン。メール＝ログインID。Employee と1対1）
 *   ・部署ごとに Staff（予約を受ける人）と Membership（担当部署・役割）
 * 「その部署のメンバー」＝その部署に在籍中のスタッフがいるか、担当（Membership）があること。
 */

export type MemberRole = "owner" | "staff";

export type Actor = { role: string; tenantId: string; userId: string };

/** 画面に出す役割の名前。中の値は今まで通り owner / staff のまま */
export function memberRoleLabel(role: string | null): string {
  if (role === "owner") return "オーナー";
  if (role === "staff") return "一般";
  return "ログインなし";
}

/** 部署のチェックを触れる部署。全社管理者は全部署、オーナーは今の部署だけ */
export function managedTenantIds(actor: Actor, allTenantIds: string[]): string[] {
  if (actor.role === "group_admin") return allTenantIds;
  if (actor.role === "owner") return allTenantIds.filter((t) => t === actor.tenantId);
  return [];
}

/**
 * 名前・メールの変更、パスワードを戻す、退職、登録の取り消しをしてよいか。
 * 会社全体に効く操作なので、オーナーは「自分の部署だけのメンバー」に限る
 * （ほかの部署も担当している人・全社管理者は全社管理者が扱う）。
 */
export function canEditPerson(
  actor: Actor,
  person: { isGroupAdmin: boolean; tenantIds: string[] },
): boolean {
  if (actor.role === "group_admin") return true;
  if (actor.role !== "owner" || person.isGroupAdmin) return false;
  return person.tenantIds.length > 0 && person.tenantIds.every((t) => t === actor.tenantId);
}

export type AssignmentChange =
  | { kind: "add"; tenantId: string; role: MemberRole }
  | { kind: "keep"; tenantId: string; role: MemberRole }
  | { kind: "remove"; tenantId: string };

/**
 * 部署のチェックを、部署ごとの「足す／そのまま（役割は変わりうる）／外す」に置き換える。
 * 触れない部署（オーナーから見たほかの部署）は、チェックの有無にかかわらず何もしない。
 *
 * @param assigned 今メンバーになっている部署
 * @param checked  チェックされた部署と、選ばれた役割
 */
export function planAssignments(
  assigned: string[],
  checked: Map<string, MemberRole>,
  managed: string[],
): AssignmentChange[] {
  const changes: AssignmentChange[] = [];
  for (const tenantId of managed) {
    const role = checked.get(tenantId);
    const isAssigned = assigned.includes(tenantId);
    if (role && !isAssigned) changes.push({ kind: "add", tenantId, role });
    else if (role && isAssigned) changes.push({ kind: "keep", tenantId, role });
    else if (!role && isAssigned) changes.push({ kind: "remove", tenantId });
  }
  return changes;
}

/** フォームの「部署のチェック」と「部署ごとの役割」を読む（役割が無い・不正なら一般） */
export function readCheckedTenants(formData: FormData): Map<string, MemberRole> {
  const checked = new Map<string, MemberRole>();
  for (const tenantId of formData.getAll("tenantIds").map(String)) {
    if (!tenantId) continue;
    const role = String(formData.get(`role_${tenantId}`) ?? "staff");
    checked.set(tenantId, role === "owner" ? "owner" : "staff");
  }
  return checked;
}
