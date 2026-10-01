"use server";

/**
 * 名簿の人（メンバー）と、部署の予約担当（スタッフ）を手で結ぶ。全社管理者だけが使う。
 *
 * ふだんの登録・部署の付け外しは member-actions.ts（設定→メンバー）で行い、
 * そこでは同じ名前の担当が自動で同じ人にまとまる。ここは、部署での表示名がメンバーの名前と
 * 違う（例：部署では「竹内」、メンバーは「竹内 太郎」）ためにまとまらなかった人を、
 * 名前を変えずに結ぶための補助。
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireGroupAdmin } from "./auth";
import { prisma } from "./prisma";

const PATH = "/settings/members";

function back(message?: string): never {
  redirect(message ? `${PATH}?error=${encodeURIComponent(message)}` : `${PATH}?done=1`);
}

/** スタッフを名簿の人に結ぶ。employeeId が空なら結び付きを外す */
export async function linkStaffToEmployee(formData: FormData) {
  await requireGroupAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  const choice = String(formData.get("employeeId") ?? "");

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) back("スタッフが見つかりません");

  let employeeId: string | null = null;
  if (choice) {
    const employee = await prisma.employee.findUnique({ where: { id: choice } });
    if (!employee) back("メンバーが見つかりません");
    // 1つの部署に同じ人が2人いる形は認めない。部署の中の重なりは person-busy.ts では
    // 見ない（呼び出し側が見ている前提）ため、その2人の間の二重予約を防げなくなる
    const sameTenant = await prisma.staff.findFirst({
      where: { employeeId: choice, tenantId: staff.tenantId, id: { not: staff.id } },
    });
    if (sameTenant) back(`${employee.name} さんは、この部署ではすでに「${sameTenant.name}」と結ばれています`);
    employeeId = employee.id;
  }

  await prisma.staff.update({ where: { id: staff.id }, data: { employeeId } });

  revalidatePath(PATH);
  revalidatePath("/team");
  revalidatePath("/calendar");
  revalidatePath("/booking");
  back();
}
