/**
 * 部署でスタッフを新しく作ったときに、会社全体の社員名簿へ自動で載せる。
 *
 * 部署の運用はオーナーが行い、名簿は全社管理者が見るため、名簿への登録を手作業にすると
 * 「全社の1日に出ない」「兼任先の空き時間に反映されない」漏れが起きやすい。
 *
 *   ・名簿に同じ名前の在籍者がいれば、その人にひも付ける（兼任として1人にまとまる）
 *     ただし、その人がこの部署で既に別のスタッフとひも付いていれば何もしない
 *     （1つの部署に同じ人は1人まで。person-busy.ts の前提）
 *   ・いなければ、名簿にもその名前で作ってひも付ける
 *
 * 戻り値は、オーナーに見せる案内（何をしたか）。
 */
import type { Prisma } from "@/generated/prisma/client";
import { findSameNameEmployee } from "./employee-names";

export async function addNewStaffToRoster(
  tx: Prisma.TransactionClient,
  staff: { id: string; tenantId: string; name: string },
): Promise<string> {
  const employees = await tx.employee.findMany({
    where: { isActive: true },
    select: { id: true, name: true, isActive: true },
  });
  const same = findSameNameEmployee(employees, staff.name);

  if (same) {
    const taken = await tx.staff.findFirst({
      where: { tenantId: staff.tenantId, employeeId: same.id, id: { not: staff.id } },
    });
    if (taken) {
      return `社員名簿の「${same.name}」さんはこの部署の「${taken.name}」とひも付いているため、名簿には載せていません。別の人なら全社管理者に伝えてください。`;
    }
    await tx.staff.update({ where: { id: staff.id }, data: { employeeId: same.id } });
    return `社員名簿にいる「${same.name}」さんとひも付けました（ほかの部署と兼任の扱いになり、どの部署の予約・予定もお互いの空き時間に反映されます）。別の人なら全社管理者に伝えてください。`;
  }

  const last = await tx.employee.findFirst({ orderBy: { displayOrder: "desc" } });
  const created = await tx.employee.create({
    data: { name: staff.name, displayOrder: (last?.displayOrder ?? 0) + 1 },
  });
  await tx.staff.update({ where: { id: staff.id }, data: { employeeId: created.id } });
  return `社員名簿にも「${staff.name}」さんを登録しました（全社の1日に表示されます）。`;
}
