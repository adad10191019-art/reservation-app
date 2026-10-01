"use server";

/**
 * 社員名簿の管理。全部署を横断する名簿なので、全社管理者（group_admin）だけが使える。
 *
 *   ・社員の追加、名前・表示順・在籍の変更（退職者は消さずに無効にする）
 *   ・部署のスタッフを、名簿のどの社員かにひも付ける（兼任なら同じ社員を選ぶ）
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireGroupAdmin } from "./auth";
import { prisma } from "./prisma";

const PATH = "/settings/employees";

function back(message?: string): never {
  redirect(message ? `${PATH}?error=${encodeURIComponent(message)}` : `${PATH}?done=1`);
}

function revalidateAll() {
  revalidatePath(PATH);
  revalidatePath("/team");
  revalidatePath("/calendar");
  revalidatePath("/booking");
}

export async function createEmployee(formData: FormData) {
  await requireGroupAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back("名前を入力してください");

  const last = await prisma.employee.findFirst({ orderBy: { displayOrder: "desc" } });
  await prisma.employee.create({ data: { name, displayOrder: (last?.displayOrder ?? 0) + 1 } });

  revalidateAll();
  back();
}

export async function updateEmployee(formData: FormData) {
  await requireGroupAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const displayOrder = Number(formData.get("displayOrder") ?? 0);
  if (!name) back("名前を入力してください");
  if (!Number.isInteger(displayOrder)) back("表示順は整数で入力してください");

  const updated = await prisma.employee.updateMany({
    where: { id },
    data: { name, displayOrder, isActive: formData.get("isActive") === "on" },
  });
  if (updated.count === 0) back("社員が見つかりません");

  revalidateAll();
  back();
}

/**
 * スタッフを名簿の社員にひも付ける。
 *   employeeId が空 … ひも付けを外す
 *   "new"          … そのスタッフの名前で名簿に新しく作ってひも付ける（最初の登録を楽にするため）
 */
export async function linkStaffToEmployee(formData: FormData) {
  await requireGroupAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  const choice = String(formData.get("employeeId") ?? "");

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) back("スタッフが見つかりません");

  let employeeId: string | null = null;
  if (choice === "new") {
    const last = await prisma.employee.findFirst({ orderBy: { displayOrder: "desc" } });
    const created = await prisma.employee.create({
      data: { name: staff.name, displayOrder: (last?.displayOrder ?? 0) + 1 },
    });
    employeeId = created.id;
  } else if (choice) {
    const employee = await prisma.employee.findUnique({ where: { id: choice } });
    if (!employee) back("社員が見つかりません");
    // 1つの部署に同じ人が2人いる形は認めない。部署の中の重なりは person-busy.ts では
    // 見ない（呼び出し側が見ている前提）ため、その2人の間の二重予約を防げなくなる
    const sameTenant = await prisma.staff.findFirst({
      where: { employeeId: choice, tenantId: staff.tenantId, id: { not: staff.id } },
    });
    if (sameTenant) back(`${employee.name} さんは、この部署ではすでに「${sameTenant.name}」とひも付いています`);
    employeeId = employee.id;
  }

  await prisma.staff.update({ where: { id: staff.id }, data: { employeeId } });

  revalidateAll();
  back();
}
