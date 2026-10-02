"use server";

/**
 * 設定→メンバー の保存処理。1人を「名前・メール・担当部署のチェック」だけで登録・変更する。
 *
 *   ・部署にチェックを付ける … その部署の予約を受ける人（Staff）を作り（全メニュー対応で始める）、
 *                              担当（Membership）を付ける。同じ名前の、まだ誰にもひも付いていない
 *                              在籍スタッフがいれば、新しく作らずにその人を使う
 *   ・チェックを外す         … その部署の在籍を外し、担当も外す。今日以降の予約が残っていれば外さない
 *   ・どの部署にも付けない   … 「全社の1日」だけを使う人
 * 全社管理者は全部署、オーナーは今の部署の分だけを触れる（member-access.ts）。
 * 最初のパスワードはメールアドレスと同じで、最初のログインで変えてもらう（initial-password.ts）。
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { canResetPassword } from "./account-access";
import { requireOwner } from "./auth";
import { employeeOptionLabel, findSameNameEmployee, normalizeEmployeeName } from "./employee-names";
import { EMAIL_PATTERN, initialPasswordData } from "./initial-password";
import {
  type Actor,
  type MemberRole,
  canEditPerson,
  managedTenantIds,
  planAssignments,
  readCheckedTenants,
} from "./member-access";
import { prisma } from "./prisma";
import { todayString } from "./time";

const LIST = "/settings/members";
const detailPath = (employeeId: string) => `${LIST}/${employeeId}`;

/** 保存の途中で見つかった「できない理由」。取引を巻き戻し、画面にそのまま出す */
class MemberError extends Error {}

type Tx = Prisma.TransactionClient;

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function done(path: string, notices: string[] = []): never {
  const notice = notices.join(" ");
  redirect(notice ? `${path}?done=1&notice=${encodeURIComponent(notice)}` : `${path}?done=1`);
}

/** メンバーを変えたら、予約まわり・全社の1日の画面も作り直させる */
function refreshAll() {
  revalidatePath("/calendar");
  revalidatePath("/booking");
  revalidatePath("/team");
  revalidatePath("/settings", "layout");
}

/** 取引の中で MemberError が出たら、その文を画面に出して戻る */
async function runOrFail<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof MemberError) fail(path, e.message);
    throw e;
  }
}

/** パスワードの計算は時間がかかるので、取引の外で済ませる（取引の時間切れを避ける） */
const TX_OPTIONS = { timeout: 20_000 };

// ── 1人分の読み込み ────────────────────────

const PERSON_USER = {
  select: {
    id: true,
    email: true,
    isGroupAdmin: true,
    employeeId: true,
    mustChangePassword: true,
    memberships: { select: { id: true, tenantId: true, role: true, staffId: true } },
  },
} as const;

async function loadPerson(tx: Tx, employeeId: string) {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: PERSON_USER,
      staffs: {
        select: {
          id: true,
          tenantId: true,
          isActive: true,
          membership: { select: { user: PERSON_USER } },
        },
      },
    },
  });
  if (!employee) return null;
  // 古いデータでは、ログインが名簿の人にひも付いておらず、スタッフ経由でしかたどれないことがある
  const user =
    employee.user ?? employee.staffs.find((s) => s.membership)?.membership?.user ?? null;
  const assigned = [
    ...new Set([
      ...employee.staffs.filter((s) => s.isActive).map((s) => s.tenantId),
      ...(user?.memberships.map((m) => m.tenantId) ?? []),
    ]),
  ];
  return { employee, user, assigned };
}

type Person = NonNullable<Awaited<ReturnType<typeof loadPerson>>>;

function personForCheck(p: Person) {
  return { isGroupAdmin: p.user?.isGroupAdmin ?? false, tenantIds: p.assigned };
}

/**
 * オーナーがこの人の画面を開いてよいか（今の部署のメンバーか、過去にいた人）。
 * 全社管理者は誰でも。
 */
function canSeePerson(actor: Actor, p: Person): boolean {
  if (actor.role === "group_admin") return true;
  return (
    p.assigned.includes(actor.tenantId) ||
    p.employee.staffs.some((s) => s.tenantId === actor.tenantId)
  );
}

/**
 * その部署の予約担当に、この人とは別のアカウントが付いているとき（1人に2つのアカウントがある古いデータ）。
 * どちらかが別人なので、結び付きを外してもらう。
 */
function otherAccountMessage(deptName: string, staffName: string, email: string): string {
  return (
    `${deptName}の「${staffName}」には、別のアカウント（${email}）が付いています。` +
    `1人に2つのアカウントが結ばれています。全社管理者が一覧の一番下「部署での名前が違う人を手で結ぶ」で、この人ではない方を「（結ばない）」にしてください`
  );
}

async function tenantName(tx: Tx, tenantId: string): Promise<string> {
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return t?.name ?? "";
}

// ── 部署を足す・外す ────────────────────────

/**
 * その部署のメンバーにする。戻り値は画面に出す案内。
 *   ・前にその部署にいたスタッフ（在籍を外したもの）がいれば、在籍に戻して使う
 *   ・名前が同じで、まだ誰にもひも付いていない在籍スタッフがいれば、その人を使う
 *   ・どちらも無ければ、受付中の全メニューに対応したスタッフを作る
 */
async function addToTenant(
  tx: Tx,
  p: { employeeId: string; name: string; userId: string; tenantId: string; role: MemberRole },
): Promise<string[]> {
  const deptName = await tenantName(tx, p.tenantId);
  const notices: string[] = [];

  let staff = await tx.staff.findFirst({
    where: { tenantId: p.tenantId, employeeId: p.employeeId },
    orderBy: { isActive: "desc" },
    include: { membership: { select: { userId: true, user: { select: { email: true } } } } },
  });

  if (staff && !staff.isActive) {
    staff = await tx.staff.update({
      where: { id: staff.id },
      data: { isActive: true },
      include: { membership: { select: { userId: true, user: { select: { email: true } } } } },
    });
  }

  if (!staff) {
    const key = normalizeEmployeeName(p.name);
    const unlinked = await tx.staff.findMany({
      where: { tenantId: p.tenantId, isActive: true, employeeId: null, membership: { is: null } },
    });
    const same = unlinked.find((s) => normalizeEmployeeName(s.name) === key);
    if (same) {
      staff = await tx.staff.update({
        where: { id: same.id },
        data: { employeeId: p.employeeId },
        include: { membership: { select: { userId: true, user: { select: { email: true } } } } },
      });
    }
  }

  if (!staff) {
    const last = await tx.staff.findFirst({
      where: { tenantId: p.tenantId },
      orderBy: { displayOrder: "desc" },
    });
    staff = await tx.staff.create({
      data: {
        tenantId: p.tenantId,
        name: p.name,
        displayOrder: (last?.displayOrder ?? 0) + 1,
        employeeId: p.employeeId,
      },
      include: { membership: { select: { userId: true, user: { select: { email: true } } } } },
    });
    const menus = await tx.menu.findMany({
      where: { tenantId: p.tenantId, isActive: true },
      select: { id: true },
    });
    if (menus.length > 0) {
      await tx.staffMenu.createMany({
        data: menus.map((m) => ({ tenantId: p.tenantId, staffId: staff!.id, menuId: m.id })),
      });
      notices.push(`${deptName}：受付中の全メニューに対応した状態で始めました。`);
    } else {
      notices.push(
        `${deptName}にはメニューがまだありません。予約を受けるには「メニュー」タブで登録してください。`,
      );
    }
  }

  if (staff.membership && staff.membership.userId !== p.userId) {
    throw new MemberError(
      otherAccountMessage(deptName, staff.name, staff.membership.user.email),
    );
  }

  const membership = await tx.membership.findUnique({
    where: { userId_tenantId: { userId: p.userId, tenantId: p.tenantId } },
  });
  if (membership) {
    await tx.membership.update({
      where: { id: membership.id },
      data: { role: p.role, staffId: membership.staffId ?? staff.id },
    });
  } else {
    await tx.membership.create({
      data: { userId: p.userId, tenantId: p.tenantId, role: p.role, staffId: staff.id },
    });
  }

  const hours = await tx.businessHour.count({
    where: { tenantId: p.tenantId, OR: [{ staffId: null }, { staffId: staff.id }] },
  });
  if (hours === 0) {
    notices.push(
      `${deptName}は勤務時間（営業時間）が未設定のため、まだ予約を受けられません。「営業時間」タブで入れてください。`,
    );
  }
  return notices;
}

/** オーナーがいなくなる変更を止める（設定を変えられる人がいなくなるため） */
async function assertNotLastOwner(tx: Tx, tenantId: string, deptName: string) {
  const owners = await tx.membership.count({ where: { tenantId, role: "owner" } });
  if (owners <= 1) {
    throw new MemberError(
      `${deptName}のオーナーがいなくなるため、変えられません。先にほかの人をオーナーにしてください`,
    );
  }
}

/**
 * その部署のメンバーから外す（在籍を外し、担当も外す）。
 * 過去の予約の記録を残すため、スタッフは消さずに在籍を外すだけにする。
 */
async function removeFromTenant(
  tx: Tx,
  actor: Actor,
  p: { employeeId: string; userId: string | null; tenantId: string },
) {
  const deptName = await tenantName(tx, p.tenantId);
  if (actor.role === "owner" && p.userId === actor.userId && p.tenantId === actor.tenantId) {
    throw new MemberError(
      "自分を今の部署から外すことはできません。ほかのオーナーか全社管理者に頼んでください",
    );
  }

  const membership = p.userId
    ? await tx.membership.findUnique({
        where: { userId_tenantId: { userId: p.userId, tenantId: p.tenantId } },
      })
    : null;
  const staffs = await tx.staff.findMany({
    where: {
      tenantId: p.tenantId,
      isActive: true,
      OR: [
        { employeeId: p.employeeId },
        ...(membership?.staffId ? [{ id: membership.staffId }] : []),
      ],
    },
    select: { id: true },
  });
  const staffIds = staffs.map((s) => s.id);

  const future = await tx.reservation.count({
    where: { staffId: { in: staffIds }, status: "booked", date: { gte: todayString() } },
  });
  if (future > 0) {
    throw new MemberError(
      `${deptName}に今日以降の予約が${future}件あります。先にカレンダーでほかのメンバーへ移すか、キャンセルしてから外してください`,
    );
  }
  if (membership?.role === "owner") await assertNotLastOwner(tx, p.tenantId, deptName);

  await tx.staff.updateMany({ where: { id: { in: staffIds } }, data: { isActive: false } });
  if (membership) await tx.membership.delete({ where: { id: membership.id } });
}

/** 部署はそのまま、役割と対応メニューを変える */
async function updateInTenant(
  tx: Tx,
  actor: Actor,
  p: {
    employeeId: string;
    userId: string;
    tenantId: string;
    role: MemberRole;
    menuIds: string[] | null;
  },
) {
  const deptName = await tenantName(tx, p.tenantId);
  const staff = await tx.staff.findFirst({
    where: { tenantId: p.tenantId, employeeId: p.employeeId, isActive: true },
    include: { membership: { select: { userId: true, user: { select: { email: true } } } } },
  });
  let membership = await tx.membership.findUnique({
    where: { userId_tenantId: { userId: p.userId, tenantId: p.tenantId } },
  });

  if (!membership) {
    // 古いデータ：スタッフはいるが担当（ログイン）が付いていない。ここで付ける
    if (staff?.membership && staff.membership.userId !== p.userId) {
      throw new MemberError(
        otherAccountMessage(deptName, staff.name, staff.membership.user.email),
      );
    }
    membership = await tx.membership.create({
      data: { userId: p.userId, tenantId: p.tenantId, role: p.role, staffId: staff?.id ?? null },
    });
  } else if (membership.role !== p.role) {
    if (p.userId === actor.userId && p.tenantId === actor.tenantId) {
      throw new MemberError("自分の役割は、今の部署ではここから変えられません");
    }
    if (p.role === "staff" && !membership.staffId) {
      throw new MemberError(
        `${deptName}では予約を受けていないため、一般にはできません（一般は予約を受ける人の役割です）`,
      );
    }
    if (membership.role === "owner") await assertNotLastOwner(tx, p.tenantId, deptName);
    await tx.membership.update({ where: { id: membership.id }, data: { role: p.role } });
  }

  const staffId = membership.staffId ?? staff?.id ?? null;
  if (p.menuIds && staffId) {
    const menus = await tx.menu.findMany({
      where: { id: { in: p.menuIds }, tenantId: p.tenantId },
      select: { id: true },
    });
    await tx.staffMenu.deleteMany({ where: { staffId, tenantId: p.tenantId } });
    if (menus.length > 0) {
      await tx.staffMenu.createMany({
        data: menus.map((m) => ({ tenantId: p.tenantId, staffId, menuId: m.id })),
      });
    }
  }
}

// ── 名簿の人 ────────────────────────────────

async function nextEmployeeOrder(tx: Tx) {
  const last = await tx.employee.findFirst({ orderBy: { displayOrder: "desc" } });
  return (last?.displayOrder ?? 0) + 1;
}

/** 在籍中の同じ名前の人。見分けやすいよう所属部署つきの表示も返す */
async function findSameName(tx: Tx, name: string, exceptId?: string) {
  const employees = await tx.employee.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      isActive: true,
      user: { select: { email: true } },
      staffs: { where: { isActive: true }, select: { tenant: { select: { name: true } } } },
    },
  });
  const found = findSameNameEmployee(employees, name, exceptId);
  if (!found) return null;
  return { ...found, label: employeeOptionLabel(found.name, found.staffs.map((s) => s.tenant.name)) };
}

/**
 * 新しく登録する人の名簿の行。同じ名前の在籍者がいるとき、
 * その人にまだログインが無ければ同じ人とみなして使う（部署で先に作られていた人など）。
 */
async function findOrCreateEmployee(tx: Tx, name: string) {
  const same = await findSameName(tx, name);
  if (same?.user) {
    throw new MemberError(
      `「${same.label}」さん（${same.user.email}）と同じ名前です。同じ人なら、そのメールで登録してください。別の人なら、フルネームにするなど見分けられる名前にしてください`,
    );
  }
  if (same) return { id: same.id, name: same.name, isActive: true, reused: true };
  const created = await tx.employee.create({
    data: { name, displayOrder: await nextEmployeeOrder(tx) },
  });
  return { ...created, reused: false };
}

// ── 画面から呼ぶ処理 ────────────────────────

/**
 * メンバーを登録する。
 * すでにほかの部署で使われているメールなら、同じ人に部署を足す（1人1アカウント。パスワードは今のまま）。
 */
export async function createMember(formData: FormData) {
  const actor = await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const checked = readCheckedTenants(formData);

  if (!name) fail(LIST, "名前を入力してください");
  if (!EMAIL_PATTERN.test(email)) fail(LIST, "メールアドレスの形式が正しくありません");

  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const managed = managedTenantIds(actor, tenants.map((t) => t.id));
  if ([...checked.keys()].some((t) => !managed.includes(t))) fail(LIST, "部署の指定が正しくありません");
  if (actor.role !== "group_admin" && checked.size === 0) {
    fail(LIST, "部署にチェックを入れてください（どの部署にも属さない人は、全社管理者が登録します）");
  }

  const initial = await initialPasswordData(email);
  const notices: string[] = [];

  const employeeId = await runOrFail(LIST, () =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email }, include: { employee: true } });
      let employee: { id: string; name: string; isActive: boolean };
      let userId: string;
      let hadEmployee = false;

      if (existing) {
        userId = existing.id;
        if (existing.employee) {
          employee = existing.employee;
          hadEmployee = true;
        } else {
          employee = await findOrCreateEmployee(tx, name);
          await tx.user.update({ where: { id: existing.id }, data: { employeeId: employee.id } });
        }
        if (!employee.isActive) {
          await tx.employee.update({ where: { id: employee.id }, data: { isActive: true } });
          notices.push(`在籍していなかった「${employee.name}」さんを在籍に戻しました。`);
        }
        notices.push(
          `${email} はすでに「${employee.name}」さんのログインなので、同じ人として登録しました（パスワードは今のままです）。`,
        );
      } else {
        employee = await findOrCreateEmployee(tx, name);
        const user = await tx.user.create({
          data: {
            email,
            ...initial,
            employeeId: employee.id,
            lastTenantId: [...checked.keys()][0] ?? null,
          },
        });
        userId = user.id;
        notices.push(
          `最初のパスワードはメールアドレス（${email}）と同じです。本人に伝えてください。最初にログインしたときに、自分のパスワードに変えてもらいます。`,
        );
      }

      const person = await loadPerson(tx, employee.id);
      let added = 0;
      for (const [tenantId, role] of checked) {
        if (person?.assigned.includes(tenantId)) continue;
        notices.push(...(await addToTenant(tx, { employeeId: employee.id, name: employee.name, userId, tenantId, role })));
        added++;
      }
      if (hadEmployee && checked.size > 0 && added === 0) {
        throw new MemberError(`「${employee.name}」さんは、すでにその部署のメンバーです`);
      }
      return employee.id;
    }, TX_OPTIONS),
  );

  refreshAll();
  done(detailPath(employeeId), notices);
}

/**
 * 1人の画面の保存。名前・メール・部署のチェック・役割・対応メニュー・並び順。
 * 在籍していない人の画面で保存すると、在籍に戻す。
 */
export async function saveMember(formData: FormData) {
  const actor = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const path = detailPath(id);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const checked = readCheckedTenants(formData);
  const staffOrder = Number(formData.get("staffOrder") ?? "");
  const employeeOrder = Number(formData.get("employeeOrder") ?? "");

  const person = await loadPerson(prisma, id);
  if (!person || !canSeePerson(actor, person)) fail(LIST, "メンバーが見つかりません");
  const canEdit = canEditPerson(actor, personForCheck(person));

  if (canEdit) {
    if (!name) fail(path, "名前を入力してください");
    if (!EMAIL_PATTERN.test(email)) fail(path, "メールアドレスの形式が正しくありません");
  } else if (!person.user) {
    fail(path, "この人のログインは、全社管理者が登録します");
  }

  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const managed = managedTenantIds(actor, tenants.map((t) => t.id));
  if ([...checked.keys()].some((t) => !managed.includes(t))) fail(path, "部署の指定が正しくありません");
  const changes = planAssignments(person.assigned, checked, managed);

  const emailChanged = canEdit && email !== person.user?.email;
  const initial = emailChanged ? await initialPasswordData(email) : null;
  const notices: string[] = [];

  await runOrFail(path, () =>
    prisma.$transaction(async (tx) => {
      const newName = canEdit ? name : person.employee.name;

      if (canEdit) {
        const same = await findSameName(tx, newName, id);
        if (same) {
          throw new MemberError(`在籍中の「${same.label}」さんと同じ名前になります。見分けられる名前にしてください`);
        }
      }
      await tx.employee.update({
        where: { id },
        data: {
          name: newName,
          isActive: true,
          ...(actor.role === "group_admin" && Number.isInteger(employeeOrder) && formData.get("employeeOrder") !== null
            ? { displayOrder: employeeOrder }
            : {}),
        },
      });
      if (!person.employee.isActive) notices.push("在籍に戻しました。");

      // ログイン（メール）
      let userId = person.user?.id ?? null;
      if (emailChanged && initial) {
        const taken = await tx.user.findUnique({ where: { email } });
        if (taken && taken.id !== userId) {
          throw new MemberError("このメールアドレスは、ほかの人のログインですでに使われています");
        }
        if (person.user) {
          // 最初のパスワードのままなら、新しいメールが最初のパスワードになるよう合わせる
          await tx.user.update({
            where: { id: person.user.id },
            data: { email, ...(person.user.mustChangePassword ? initial : {}) },
          });
          notices.push(`ログインのメールを ${email} に変えました。`);
        } else {
          const created = await tx.user.create({ data: { email, ...initial, employeeId: id } });
          userId = created.id;
          notices.push(
            `ログインを作りました。最初のパスワードはメールアドレス（${email}）と同じです。本人に伝えてください。`,
          );
        }
      }
      if (!userId) throw new MemberError("メールアドレスを入力してください");
      if (person.user && !person.user.employeeId) {
        // 古いデータ：ログインが名簿の人にひも付いていなければ、ここで付ける
        await tx.user.update({ where: { id: person.user.id }, data: { employeeId: id } });
      }

      for (const c of changes) {
        if (c.kind === "add") {
          notices.push(...(await addToTenant(tx, { employeeId: id, name: newName, userId, tenantId: c.tenantId, role: c.role })));
        } else if (c.kind === "remove") {
          await removeFromTenant(tx, actor, { employeeId: id, userId, tenantId: c.tenantId });
        } else {
          const menuIds =
            formData.get(`menusShown_${c.tenantId}`) === "1"
              ? formData.getAll(`menuIds_${c.tenantId}`).map(String)
              : null;
          await updateInTenant(tx, actor, { employeeId: id, userId, tenantId: c.tenantId, role: c.role, menuIds });
        }
      }

      // 名前の変更は、各部署での表示名（スタッフ名）にも反映する
      if (newName !== person.employee.name) {
        await tx.staff.updateMany({ where: { employeeId: id }, data: { name: newName } });
      }

      if (Number.isInteger(staffOrder) && formData.get("staffOrder") !== null) {
        await tx.staff.updateMany({
          where: { employeeId: id, tenantId: actor.tenantId },
          data: { displayOrder: staffOrder },
        });
      }
    }, TX_OPTIONS),
  );

  if (changes.some((c) => c.kind === "remove")) {
    notices.push("外した部署では在籍を外しました（過去の予約の記録は残っています）。");
  }
  refreshAll();
  done(path, notices);
}

/**
 * 退職。全部署から外し（在籍を外して担当も外す）、名簿でも在籍を外す。
 * ログインはできなくなる。予定・過去の予約などの記録は残る。
 */
export async function retireMember(formData: FormData) {
  const actor = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const path = detailPath(id);

  const person = await loadPerson(prisma, id);
  if (!person || !canSeePerson(actor, person)) fail(LIST, "メンバーが見つかりません");
  if (!canEditPerson(actor, personForCheck(person))) {
    fail(path, "ほかの部署も担当している人の退職は、全社管理者が行います。この部署から外すだけなら、チェックを外して保存してください");
  }
  if (person.user?.id === actor.userId) fail(path, "自分を退職にはできません");
  if (person.user?.isGroupAdmin) fail(path, "全社管理者は退職にできません");

  await runOrFail(path, () =>
    prisma.$transaction(async (tx) => {
      for (const tenantId of person.assigned) {
        await removeFromTenant(tx, actor, { employeeId: id, userId: person.user?.id ?? null, tenantId });
      }
      await tx.employee.update({ where: { id }, data: { isActive: false } });
    }, TX_OPTIONS),
  );

  refreshAll();
  done(LIST, [`「${person.employee.name}」さんを退職の扱いにしました。記録は残っています。`]);
}

/**
 * 登録の取り消し（間違えて登録したときの後始末）。
 * 予約も予定も1件も無い人に限る。ある人は「退職」で残す。
 */
export async function deleteMember(formData: FormData) {
  const actor = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const path = detailPath(id);

  const person = await loadPerson(prisma, id);
  if (!person || !canSeePerson(actor, person)) fail(LIST, "メンバーが見つかりません");
  if (!canEditPerson(actor, personForCheck(person))) {
    fail(path, "ほかの部署も担当している人の登録は、全社管理者が取り消します");
  }
  if (person.user?.id === actor.userId) fail(path, "自分の登録は取り消せません");
  if (person.user?.isGroupAdmin) fail(path, "全社管理者の登録は取り消せません");

  const staffIds = person.employee.staffs.map((s) => s.id);
  const [reservations, events] = await Promise.all([
    prisma.reservation.count({ where: { staffId: { in: staffIds } } }),
    prisma.employeeEvent.count({ where: { employeeId: id } }),
  ]);
  if (reservations > 0 || events > 0) {
    fail(path, "予約か予定の記録があるため取り消せません。辞めた人なら「退職にする」を使ってください");
  }

  await runOrFail(path, () =>
    prisma.$transaction(async (tx) => {
      for (const tenantId of person.assigned) {
        const membership = person.user?.memberships.find((m) => m.tenantId === tenantId);
        if (membership?.role === "owner") await assertNotLastOwner(tx, tenantId, await tenantName(tx, tenantId));
      }
      if (person.user) await tx.user.delete({ where: { id: person.user.id } });
      // 対応メニュー・勤務時間・ブロック枠などはスタッフの削除に連動して消える
      await tx.staff.deleteMany({ where: { id: { in: staffIds } } });
      await tx.employee.delete({ where: { id } });
    }, TX_OPTIONS),
  );

  refreshAll();
  done(LIST, [`「${person.employee.name}」さんの登録を取り消しました。`]);
}

/** パスワードを初期状態（メールアドレスと同じ）に戻す。本人は次のログインで変えることになる */
export async function resetMemberPassword(formData: FormData) {
  const actor = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const path = detailPath(id);

  const person = await loadPerson(prisma, id);
  if (!person || !canSeePerson(actor, person)) fail(LIST, "メンバーが見つかりません");
  const user = person.user;
  if (!user) fail(path, "ログインがありません");
  if (user.id === actor.userId) fail(path, "自分のパスワードは、歯車の「アカウント情報」から変えてください");
  if (!canResetPassword(actor, user)) {
    fail(path, "ほかの部署も担当している人のパスワードは、全社管理者に戻してもらってください");
  }

  await prisma.user.update({ where: { id: user.id }, data: await initialPasswordData(user.email) });

  done(path, [
    `パスワードを初期状態（メールアドレス ${user.email} と同じ）に戻しました。次にログインしたときに、新しいパスワードを決めてもらいます。`,
  ]);
}
