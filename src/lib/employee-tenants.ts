/**
 * 社員名簿の「所属部署」のチェックを、部署ごとのスタッフの操作に置き換える
 * （DB を使わない判断だけ。実際の書き込みは employee-actions.ts）。
 *
 *   チェックあり・まだひも付いていない
 *     → その部署に同じ名前の在籍スタッフがいれば、そのスタッフをこの社員にひも付ける
 *       （別の名簿の行にひも付いていても付け替える。同じ名前の在籍者は名簿に1人だけ、という
 *        決まりなので、重複して作ってしまった行からこちらへまとめる操作になる）
 *     → いなければ、社員の名前でスタッフを新しく作る
 *   チェックなし・ひも付いている
 *     → ひも付けだけを外す（過去の予約を残すため、スタッフは消さない）
 */
import { normalizeEmployeeName } from "./employee-names";

export type TenantStaff = {
  id: string;
  name: string;
  isActive: boolean;
  employeeId: string | null;
};

export type TenantPlan =
  | { kind: "link"; tenantId: string; staffId: string; movedFromOther: boolean }
  | { kind: "create"; tenantId: string }
  | { kind: "unlink"; tenantId: string; staffId: string };

export function planEmployeeTenants(
  employee: { id: string; name: string },
  checkedTenantIds: Set<string>,
  tenants: { id: string; staffs: TenantStaff[] }[],
): TenantPlan[] {
  const key = normalizeEmployeeName(employee.name);
  const plans: TenantPlan[] = [];

  for (const tenant of tenants) {
    const linked = tenant.staffs.filter((s) => s.employeeId === employee.id);
    const checked = checkedTenantIds.has(tenant.id);

    if (checked && linked.length === 0) {
      const sameName = tenant.staffs.find(
        (s) => s.isActive && normalizeEmployeeName(s.name) === key,
      );
      plans.push(
        sameName
          ? {
              kind: "link",
              tenantId: tenant.id,
              staffId: sameName.id,
              movedFromOther: sameName.employeeId !== null,
            }
          : { kind: "create", tenantId: tenant.id },
      );
    } else if (!checked) {
      for (const s of linked) plans.push({ kind: "unlink", tenantId: tenant.id, staffId: s.id });
    }
  }
  return plans;
}
