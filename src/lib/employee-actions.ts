"use server";

/**
 * 社員名簿の管理。全部署を横断する名簿なので、全社管理者（group_admin）だけが使える。
 *
 *   ・社員の追加、名前・表示順・在籍の変更（退職者は消さずに無効にする）
 *   ・予定もひも付けも無い行の削除（重複して作ってしまった行の後始末用）
 *   ・部署のスタッフを、名簿のどの社員かにひも付ける（兼任なら同じ社員を選ぶ）
 *
 * 同じ名前の在籍者は作らない。兼任の人を部署ごとに作ってしまうと、別人として扱われて
 * 部署をまたいだ二重予約を防げず、「全社の1日」にも2列並んでしまうため。
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireGroupAdmin } from "./auth";
import { employeeOptionLabel, findSameNameEmployee } from "./employee-names";
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

/** 在籍中の同じ名前の人がいれば、その人の表示（所属部署つき）を返す */
async function sameNameLabel(name: string, exceptId?: string): Promise<string | null> {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true, name: true, isActive: true, staffs: { select: { tenant: { select: { name: true } } } } },
  });
  const found = findSameNameEmployee(employees, name, exceptId);
  return found ? employeeOptionLabel(found.name, found.staffs.map((s) => s.tenant.name)) : null;
}

async function nextDisplayOrder() {
  const last = await prisma.employee.findFirst({ orderBy: { displayOrder: "desc" } });
  return (last?.displayOrder ?? 0) + 1;
}

export async function createEmployee(formData: FormData) {
  await requireGroupAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back("名前を入力してください");

  const same = await sameNameLabel(name);
  if (same) {
    back(
      `名簿にはすでに「${same}」がいます。同じ人なら追加は不要です。別の人なら、フルネームにするなど名前を見分けられるようにしてください`,
    );
  }

  await prisma.employee.create({ data: { name, displayOrder: await nextDisplayOrder() } });

  revalidateAll();
  back();
}

export async function updateEmployee(formData: FormData) {
  await requireGroupAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const displayOrder = Number(formData.get("displayOrder") ?? 0);
  const isActive = formData.get("isActive") === "on";
  if (!name) back("名前を入力してください");
  if (!Number.isInteger(displayOrder)) back("表示順は整数で入力してください");

  if (isActive) {
    const same = await sameNameLabel(name, id);
    if (same) back(`在籍中の「${same}」と同じ名前になります。名前を見分けられるようにしてください`);
  }

  const updated = await prisma.employee.updateMany({
    where: { id },
    data: { name, displayOrder, isActive },
  });
  if (updated.count === 0) back("社員が見つかりません");

  revalidateAll();
  back();
}

/**
 * 名簿の行を消す。予定もスタッフとのひも付けも無い行に限る
 * （予定が付いている人は、退職なら「在籍」を外して残す）。
 */
export async function deleteEmployee(formData: FormData) {
  await requireGroupAdmin();
  const id = String(formData.get("id") ?? "");

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { _count: { select: { staffs: true, events: true } } },
  });
  if (!employee) back("社員が見つかりません");
  if (employee._count.staffs > 0) {
    back(`${employee.name} さんは部署のスタッフとひも付いているので消せません。先にひも付けを外してください`);
  }
  if (employee._count.events > 0) {
    back(`${employee.name} さんには予定が入っているので消せません。退職などの場合は「在籍」を外してください`);
  }

  await prisma.employee.delete({ where: { id } });

  revalidateAll();
  back();
}

/**
 * スタッフを名簿の社員にひも付ける。
 *   employeeId が空 … ひも付けを外す
 *   "new"          … そのスタッフの名前で名簿に新しく作ってひも付ける（最初の登録を楽にするため）。
 *                    同じ名前の在籍者がいれば作らず、一覧からその人を選ぶよう案内する
 */
export async function linkStaffToEmployee(formData: FormData) {
  await requireGroupAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  const choice = String(formData.get("employeeId") ?? "");

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) back("スタッフが見つかりません");

  let employeeId: string | null = null;
  if (choice === "new") {
    const same = await sameNameLabel(staff.name);
    if (same) {
      back(
        `名簿にはすでに「${same}」がいます。同じ人（兼任）なら、一覧からその人を選んで保存してください。` +
          `別の人なら、先に「設定 → スタッフ」か名簿で名前を見分けられるようにしてください`,
      );
    }
    const created = await prisma.employee.create({
      data: { name: staff.name, displayOrder: await nextDisplayOrder() },
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
