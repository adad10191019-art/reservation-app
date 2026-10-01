"use server";

/**
 * 社員名簿の管理。全部署を横断する名簿なので、全社管理者（group_admin）だけが使える。
 *
 *   ・社員の追加、名前・表示順・在籍の変更（退職者は消さずに無効にする）
 *   ・所属部署のチェック（部署にスタッフを作る／既存のスタッフにひも付ける／外す。employee-tenants.ts）
 *   ・予定もひも付けも無い行の削除（重複して作ってしまった行の後始末用）
 *   ・部署のスタッフを、名簿のどの社員かにひも付ける（兼任なら同じ社員を選ぶ）
 *   ・部署に属さない社員のログイン（担当部署の無いアカウント）の発行・パスワードを戻す・取り消し
 *
 * 同じ名前の在籍者は作らない。兼任の人を部署ごとに作ってしまうと、別人として扱われて
 * 部署をまたいだ二重予約を防げず、「全社の1日」にも2列並んでしまうため。
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireGroupAdmin } from "./auth";
import { employeeOptionLabel, findSameNameEmployee } from "./employee-names";
import { planEmployeeTenants } from "./employee-tenants";
import { EMAIL_PATTERN, initialPasswordData } from "./initial-password";
import { prisma } from "./prisma";

const PATH = "/settings/employees";

function back(message?: string): never {
  redirect(message ? `${PATH}?error=${encodeURIComponent(message)}` : `${PATH}?done=1`);
}

/** 保存はできたが、続けてやってほしいことがあるとき */
function backWithNotice(notice: string): never {
  redirect(`${PATH}?done=1&notice=${encodeURIComponent(notice)}`);
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

/**
 * 名簿の1行を保存する。名前・表示順・在籍に加えて、所属部署のチェックも反映する。
 * 部署のチェックは、画面にチェック欄が出ているとき（tenantsShown）だけ見る。
 */
export async function updateEmployee(formData: FormData) {
  await requireGroupAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const displayOrder = Number(formData.get("displayOrder") ?? 0);
  const isActive = formData.get("isActive") === "on";
  const tenantsShown = formData.get("tenantsShown") === "1";
  const checkedTenantIds = new Set(formData.getAll("tenantIds").map(String));
  if (!name) back("名前を入力してください");
  if (!Number.isInteger(displayOrder)) back("表示順は整数で入力してください");

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) back("社員が見つかりません");

  if (isActive) {
    const same = await sameNameLabel(name, id);
    if (same) back(`在籍中の「${same}」と同じ名前になります。名前を見分けられるようにしてください`);
  }

  const tenants = tenantsShown
    ? await prisma.tenant.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          staffs: {
            orderBy: { displayOrder: "asc" },
            select: { id: true, name: true, isActive: true, employeeId: true },
          },
        },
      })
    : [];
  if ([...checkedTenantIds].some((t) => !tenants.some((x) => x.id === t))) {
    back("部署の指定が正しくありません");
  }
  const plans = tenantsShown ? planEmployeeTenants({ id, name }, checkedTenantIds, tenants) : [];

  // 名前の変更と部署の付け外しは1つの取引にまとめる（途中で失敗して半端な状態を残さない）
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { name, displayOrder, isActive } });
    for (const plan of plans) {
      if (plan.kind === "link") {
        await tx.staff.update({ where: { id: plan.staffId }, data: { employeeId: id } });
      } else if (plan.kind === "unlink") {
        await tx.staff.update({ where: { id: plan.staffId }, data: { employeeId: null } });
      } else {
        const last = await tx.staff.findFirst({
          where: { tenantId: plan.tenantId },
          orderBy: { displayOrder: "desc" },
        });
        await tx.staff.create({
          data: {
            tenantId: plan.tenantId,
            name,
            displayOrder: (last?.displayOrder ?? 0) + 1,
            employeeId: id,
          },
        });
      }
    }
  });

  revalidateAll();

  const tenantName = (tenantId: string) => tenants.find((t) => t.id === tenantId)?.name ?? "";
  const notices: string[] = [];
  const created = plans.filter((p) => p.kind === "create").map((p) => tenantName(p.tenantId));
  if (created.length > 0) {
    notices.push(
      `${created.join("・")} にスタッフ「${name}」を作りました。お客様の予約を受けるには、` +
        `その部署に切り替えて「設定 → スタッフ」で担当メニューを選んでください（選ぶまでは予約画面に出ません）。`,
    );
  }
  const unlinked = plans.filter((p) => p.kind === "unlink").map((p) => tenantName(p.tenantId));
  if (unlinked.length > 0) {
    notices.push(
      `${unlinked.join("・")} のスタッフとのひも付けを外しました（スタッフ自体は残っています）。` +
        `その部署で予約を受けないなら、「設定 → スタッフ」で在籍を外してください。`,
    );
  }
  if (plans.some((p) => p.kind === "link" && p.movedFromOther)) {
    notices.push(
      "別の名簿の行にひも付いていたスタッフを、この人に付け替えました。予定もひも付けも無くなった行は「削除」で消せます。",
    );
  }
  if (notices.length > 0) backWithNotice(notices.join(" "));
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
    include: { _count: { select: { staffs: true, events: true } }, user: true },
  });
  if (!employee) back("社員が見つかりません");
  if (employee.user) back(`${employee.name} さんにはログインがあるので消せません。先にログインを取り消してください`);
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

// ── 社員のログイン（部署に属さない人） ────────────────

/**
 * 社員のログインを発行する。最初のパスワードはメールアドレスと同じで、
 * 本人が最初にログインしたときに自分のパスワードへ変える。
 * 部署のアカウントを持つ人は、そちらで「全社の1日」を使えるので発行しない。
 */
export async function issueMemberLogin(formData: FormData) {
  await requireGroupAdmin();
  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) back("メールアドレスの形式が正しくありません");

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      user: true,
      staffs: { select: { membership: { select: { user: { select: { email: true } } } } } },
    },
  });
  if (!employee) back("社員が見つかりません");
  if (!employee.isActive) back("在籍していない人にはログインを発行できません");
  if (employee.user) back(`${employee.name} さんのログインは発行済みです`);
  const deptAccount = employee.staffs.find((s) => s.membership)?.membership?.user;
  if (deptAccount) {
    back(
      `${employee.name} さんは部署のアカウント（${deptAccount.email}）で「全社の1日」を使えるので、発行は不要です`,
    );
  }

  // ログインはメールで探すので、どのアカウントとも重ならないアドレスに限る
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) back("このメールアドレスは、ほかのアカウントですでに使われています");

  await prisma.user.create({
    data: { email, ...(await initialPasswordData(email)), employeeId: employee.id },
  });

  revalidatePath(PATH);
  backWithNotice(
    `ログインを発行しました。最初のパスワードはメールアドレス（${email}）と同じです。本人に伝えてください。最初にログインしたときに、自分のパスワードに変えてもらいます。`,
  );
}

/** 本人がパスワードを忘れたときなどに、パスワードを初期状態（メールアドレスと同じ）に戻す */
export async function resetMemberPassword(formData: FormData) {
  await requireGroupAdmin();
  const id = String(formData.get("id") ?? "");

  const user = await prisma.user.findUnique({ where: { employeeId: id } });
  if (!user) back("ログインが見つかりません");
  await prisma.user.update({ where: { id: user.id }, data: await initialPasswordData(user.email) });

  revalidatePath(PATH);
  backWithNotice(
    `${user.email} のパスワードを初期状態（メールアドレスと同じ）に戻しました。次にログインしたときに、新しいパスワードを決めてもらいます。`,
  );
}

/**
 * 社員のログインを取り消す（予定などの記録は名簿の人に付いているので残る）。
 * 部署の担当があるアカウント・全社管理者は、ここでは消さない（部署の 設定→アカウント で外す）。
 */
export async function revokeMemberLogin(formData: FormData) {
  await requireGroupAdmin();
  const id = String(formData.get("id") ?? "");

  const deleted = await prisma.user.deleteMany({
    where: { employeeId: id, isGroupAdmin: false, memberships: { none: {} } },
  });
  if (deleted.count === 0) back("取り消せるログインが見つかりません");

  revalidatePath(PATH);
  back();
}
