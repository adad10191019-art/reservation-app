/**
 * 設定→メンバー の保存処理（member-actions.ts）を開発用 DB で確かめる。npm run test:db で流す。
 *
 *   ・オーナーは今の部署にだけ登録でき、新しい人は全メニュー対応・最初のパスワード＝メールで始まる
 *   ・ほかの部署の人のメールなら同じ人として部署を足す（パスワードは今のまま）
 *   ・同じ名前でまだ誰にもひも付いていない予約担当がいれば、新しく作らずにその人を使う
 *   ・部署の付け替え（異動）。今日以降の予約が残っていれば外さない。最後のオーナー・自分は外せない
 *   ・部署なしの人はログインすると「全体スケジュール」へ。退職するとログイン中でも入れなくなる
 *   ・オーナーは、ほかの部署も担当している人の退職・パスワードを扱えない
 *   ・「まだ整っていない人」のログイン・予約担当を消す。最後のオーナー・自分・今日以降の予約がある人は消さない
 *
 * Cookie・画面移動・再描画は Next.js の外では動かないので差し替える（one-account.db.test.ts と同じ）。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import {
  TEST_DATE,
  type TestShop,
  createTestShop,
  deleteLeftoverTestShops,
  deleteTestEmployees,
  deleteTestShop,
} from "@/test/db-fixture";

const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));

class Redirected extends Error {
  constructor(readonly url: string) {
    super(url);
  }
}

process.env.AUTH_SECRET ??= "test-secret-at-least-16-chars";

const { login, switchTenant } = await import("./actions");
const {
  createMember,
  deleteLooseStaff,
  deleteLooseUser,
  deleteMember,
  resetMemberPassword,
  retireMember,
  saveMember,
} = await import("./member-actions");
const { requireTeamSession } = await import("./auth");
const { hashPassword, verifyPassword } = await import("./password");

async function redirectOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof Redirected) return e.url;
    throw e;
  }
  throw new Error("redirect されませんでした");
}

/** 同じ名前の欄が複数あるときは配列で渡す */
function form(fields: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const one of Array.isArray(v) ? v : [v]) f.append(k, one);
  }
  return f;
}

/** 戻り先のエラー文（成功なら null） */
async function errorOf(
  action: (f: FormData) => Promise<void>,
  fields: Record<string, string | string[]>,
) {
  const url = await redirectOf(() => action(form(fields)));
  return new URL(url, "http://x").searchParams.get("error");
}

/** 戻り先の案内文 */
async function noticeOf(
  action: (f: FormData) => Promise<void>,
  fields: Record<string, string | string[]>,
) {
  const url = await redirectOf(() => action(form(fields)));
  return new URL(url, "http://x").searchParams.get("notice");
}

const PASSWORD = "password-for-test";
const ADMIN = "member-actions-admin@example.test";
const OWNER_A = "member-actions-owner-a@example.test";
const OWNER_B = "member-actions-owner-b@example.test";
const NEW = "member-actions-new@example.test";
const OTHER = "member-actions-other@example.test";
const EMAILS = [ADMIN, OWNER_A, OWNER_B, NEW, OTHER];
const P = "[自動テスト] ";

let shopA: TestShop;
let shopB: TestShop;

async function createUser(
  email: string,
  memberships: { tenantId: string; role: "owner" | "staff"; staffId: string | null }[],
  isGroupAdmin = false,
) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      isGroupAdmin,
      memberships: { create: memberships },
    },
  });
}

async function loginAs(email: string, tenantId?: string) {
  jar.clear();
  await redirectOf(() => login(form({ email, password: PASSWORD })));
  if (tenantId) await redirectOf(() => switchTenant(form({ tenantId })));
}

/** メールから、その人の名簿の行・部署ごとの担当とスタッフを読む */
async function personOf(email: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: {
      memberships: true,
      employee: { include: { staffs: { include: { staffMenus: true } } } },
    },
  });
  return { user, employee: user.employee!, staffs: user.employee!.staffs };
}

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shopA = await createTestShop("member-actions-A");
  shopB = await createTestShop("member-actions-B");
});

afterEach(async () => {
  jar.clear();
  const tenantIds = [shopA.tenantId, shopB.tenantId];
  await prisma.reservation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.loginAttempt.deleteMany({ where: { email: { in: EMAILS } } });
  await deleteTestEmployees();
  // テストで作った予約担当を消し、テスト用の担当A・Bは元に戻す
  await prisma.staff.deleteMany({ where: { tenantId: { in: tenantIds }, name: { startsWith: P } } });
  await prisma.staff.updateMany({ where: { tenantId: { in: tenantIds } }, data: { isActive: true } });
});

afterAll(async () => {
  await deleteTestShop(shopA.tenantId);
  await deleteTestShop(shopB.tenantId);
});

describe("オーナーの登録", () => {
  it("今の部署に、全メニュー対応・最初のパスワード＝メールで登録する。ほかの部署には登録できない", async () => {
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    await loginAs(OWNER_A);

    expect(
      await errorOf(createMember, { name: `${P}新人`, email: NEW, tenantIds: shopB.tenantId }),
    ).toContain("部署の指定");
    expect(await errorOf(createMember, { name: `${P}新人`, email: NEW })).toContain("チェック");

    expect(
      await errorOf(createMember, { name: `${P}新人`, email: NEW, tenantIds: shopA.tenantId }),
    ).toBeNull();

    const { user, employee, staffs } = await personOf(NEW);
    expect(user.mustChangePassword).toBe(true);
    expect(await verifyPassword(NEW, user.passwordHash)).toBe(true);
    expect(employee.name).toBe(`${P}新人`);
    expect(staffs).toHaveLength(1);
    expect(staffs[0]).toMatchObject({ tenantId: shopA.tenantId, isActive: true });
    expect(staffs[0].staffMenus.map((m) => m.menuId).sort()).toEqual(
      [shopA.cut.id, shopA.color.id].sort(),
    );
    expect(user.memberships).toMatchObject([
      { tenantId: shopA.tenantId, role: "staff", staffId: staffs[0].id },
    ]);
  });

  it("ほかの部署の人のメールなら同じ人に部署を足し、パスワードは変えない。同じ名前の別人は登録しない", async () => {
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    await createUser(ADMIN, [], true);
    await loginAs(ADMIN, shopB.tenantId);
    await errorOf(createMember, { name: `${P}兼任`, email: OTHER, tenantIds: shopB.tenantId });
    await prisma.user.update({
      where: { email: OTHER },
      data: { passwordHash: await hashPassword(PASSWORD), mustChangePassword: false },
    });

    await loginAs(OWNER_A);
    expect(
      await errorOf(createMember, { name: `${P}兼任`, email: NEW, tenantIds: shopA.tenantId }),
    ).toContain("同じ名前");
    expect(
      await errorOf(createMember, { name: "名前は無視される", email: OTHER, tenantIds: shopA.tenantId }),
    ).toBeNull();

    const { user, employee, staffs } = await personOf(OTHER);
    expect(employee.name).toBe(`${P}兼任`);
    expect(user.memberships.map((m) => m.tenantId).sort()).toEqual(
      [shopA.tenantId, shopB.tenantId].sort(),
    );
    expect(staffs.map((s) => s.tenantId).sort()).toEqual([shopA.tenantId, shopB.tenantId].sort());
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);

    expect(
      await errorOf(createMember, { name: "x", email: OTHER, tenantIds: shopA.tenantId }),
    ).toContain("すでにその部署のメンバー");
  });

  it("同じ名前で、まだ誰にもひも付いていない予約担当がいれば、新しく作らずにその人を使う", async () => {
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    await prisma.staff.update({ where: { id: shopA.staffB.id }, data: { name: `${P}前からいる人` } });
    await loginAs(OWNER_A);

    expect(
      await errorOf(createMember, { name: `${P}前からいる人`, email: NEW, tenantIds: shopA.tenantId }),
    ).toBeNull();
    const { user, staffs } = await personOf(NEW);
    expect(staffs.map((s) => s.id)).toEqual([shopA.staffB.id]);
    expect(user.memberships[0].staffId).toBe(shopA.staffB.id);
    // 前からの対応メニュー（カットのみ）はそのまま
    expect(staffs[0].staffMenus.map((m) => m.menuId)).toEqual([shopA.cut.id]);

    await prisma.staff.update({ where: { id: shopA.staffB.id }, data: { name: "テスト担当B", employeeId: null } });
  });

  it("まだ整っていない人（担当と予約担当だけあるログイン）をメンバーにすると、その予約担当も同じ人に結ぶ", async () => {
    await createUser(ADMIN, [], true);
    await createUser(NEW, [{ tenantId: shopA.tenantId, role: "staff", staffId: shopA.staffB.id }]);
    await loginAs(ADMIN, shopA.tenantId);

    // 画面の「メンバーにする」と同じ欄
    expect(
      await errorOf(createMember, {
        name: `${P}整える人`,
        email: NEW,
        tenantIds: shopA.tenantId,
        [`role_${shopA.tenantId}`]: "staff",
      }),
    ).toBeNull();
    const { employee, staffs } = await personOf(NEW);
    expect(staffs.map((s) => s.id)).toEqual([shopA.staffB.id]);

    // ずれたままの古いデータも、1人の画面で保存すると結ばれる
    await prisma.staff.update({ where: { id: shopA.staffB.id }, data: { employeeId: null } });
    expect(
      await errorOf(saveMember, {
        id: employee.id,
        name: employee.name,
        email: NEW,
        tenantIds: shopA.tenantId,
        [`role_${shopA.tenantId}`]: "staff",
      }),
    ).toBeNull();
    expect((await personOf(NEW)).staffs.map((s) => s.id)).toEqual([shopA.staffB.id]);

    await prisma.staff.update({ where: { id: shopA.staffB.id }, data: { employeeId: null } });
  });
});

describe("部署の付け替え", () => {
  it("A から B へ移すと、A では在籍と担当が外れ、B に全メニュー対応で入る。予約が残っていれば外さない", async () => {
    await createUser(ADMIN, [], true);
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    await loginAs(ADMIN, shopA.tenantId);
    await errorOf(createMember, { name: `${P}異動する人`, email: NEW, tenantIds: shopA.tenantId });
    const before = await personOf(NEW);
    const staffA = before.staffs[0];

    // 今日以降の予約があると外せない
    await prisma.reservation.create({
      data: {
        tenantId: shopA.tenantId,
        staffId: staffA.id,
        customerId: shopA.customer.id,
        menuId: shopA.cut.id,
        date: TEST_DATE,
        startMinutes: 600,
        endMinutes: 675,
        menuNameSnapshot: "カット",
        durationSnapshot: 60,
        priceSnapshot: 4000,
      },
    });
    const move = { id: before.employee.id, name: `${P}異動する人`, email: NEW, tenantIds: shopB.tenantId };
    expect(await errorOf(saveMember, move)).toContain("今日以降の予約が1件");
    expect((await personOf(NEW)).user.memberships.map((m) => m.tenantId)).toEqual([shopA.tenantId]);

    await prisma.reservation.updateMany({ where: { staffId: staffA.id }, data: { status: "canceled" } });
    expect(await errorOf(saveMember, move)).toBeNull();

    const after = await personOf(NEW);
    expect(after.user.memberships.map((m) => m.tenantId)).toEqual([shopB.tenantId]);
    expect(after.staffs.find((s) => s.tenantId === shopA.tenantId)?.isActive).toBe(false);
    const staffB = after.staffs.find((s) => s.tenantId === shopB.tenantId)!;
    expect(staffB.isActive).toBe(true);
    expect(staffB.staffMenus).toHaveLength(2);

    // 戻すと、A の前のスタッフを在籍に戻して使う（新しく作らない）
    expect(await errorOf(saveMember, { ...move, tenantIds: [shopA.tenantId, shopB.tenantId] })).toBeNull();
    const back = await personOf(NEW);
    expect(back.staffs.filter((s) => s.tenantId === shopA.tenantId).map((s) => [s.id, s.isActive])).toEqual([
      [staffA.id, true],
    ]);
  });

  it("最後のオーナーは外せず、オーナーは自分を今の部署から外せない。役割と対応メニューを変えられる", async () => {
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    await loginAs(OWNER_A);
    await errorOf(createMember, {
      name: `${P}二人目`,
      email: NEW,
      tenantIds: shopA.tenantId,
      [`role_${shopA.tenantId}`]: "owner",
    });
    const { employee } = await personOf(NEW);
    const base = { id: employee.id, name: `${P}二人目`, email: NEW };

    // 一般に下げ、対応メニューをカットだけにする
    expect(
      await errorOf(saveMember, {
        ...base,
        tenantIds: shopA.tenantId,
        [`role_${shopA.tenantId}`]: "staff",
        [`menusShown_${shopA.tenantId}`]: "1",
        [`menuIds_${shopA.tenantId}`]: shopA.cut.id,
      }),
    ).toBeNull();
    const changed = await personOf(NEW);
    expect(changed.user.memberships[0].role).toBe("staff");
    expect(changed.staffs[0].staffMenus.map((m) => m.menuId)).toEqual([shopA.cut.id]);

    // 自分（OWNER_A）を外そうとしても外れない。OWNER_A は名簿の人ではないので、自分の画面は「メンバーにする」で整える
    await errorOf(createMember, { name: `${P}オーナーA`, email: OWNER_A, tenantIds: shopA.tenantId });
    const self = await personOf(OWNER_A);
    expect(
      await errorOf(saveMember, { id: self.employee.id, name: `${P}オーナーA`, email: OWNER_A }),
    ).toContain("自分を今の部署から外す");

    // 部署の唯一のオーナーをほかの人（全社管理者）が外そうとしても外れない
    await createUser(ADMIN, [], true);
    await loginAs(ADMIN, shopA.tenantId);
    expect(
      await errorOf(saveMember, { id: self.employee.id, name: `${P}オーナーA`, email: OWNER_A }),
    ).toContain("オーナーがいなくなる");
  });
});

describe("部署なしの人・退職・パスワード", () => {
  it("部署なしの人はログインすると全体スケジュールへ。退職するとログイン中でも入れなくなる", async () => {
    await createUser(ADMIN, [], true);
    await loginAs(ADMIN, shopA.tenantId);
    expect(await errorOf(createMember, { name: `${P}事務`, email: NEW })).toBeNull();
    const { employee } = await personOf(NEW);
    await prisma.user.update({
      where: { email: NEW },
      data: { passwordHash: await hashPassword(PASSWORD), mustChangePassword: false },
    });

    jar.clear();
    expect(await redirectOf(() => login(form({ email: NEW, password: PASSWORD })))).toBe("/team");
    const memberJar = new Map(jar);

    await loginAs(ADMIN, shopA.tenantId);
    expect(await errorOf(retireMember, { id: employee.id })).toBeNull();

    jar.clear();
    for (const [k, v] of memberJar) jar.set(k, v);
    expect(await redirectOf(() => requireTeamSession())).toBe("/login");
  });

  it("オーナーは、ほかの部署も担当している人の退職・パスワードを扱えず、この部署だけの人は扱える", async () => {
    await createUser(ADMIN, [], true);
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    await loginAs(ADMIN, shopA.tenantId);
    await errorOf(createMember, {
      name: `${P}兼任`,
      email: OTHER,
      tenantIds: [shopA.tenantId, shopB.tenantId],
    });
    await errorOf(createMember, { name: `${P}Aだけ`, email: NEW, tenantIds: shopA.tenantId });
    const both = (await personOf(OTHER)).employee;
    const onlyA = (await personOf(NEW)).employee;

    await loginAs(OWNER_A);
    expect(await errorOf(retireMember, { id: both.id })).toContain("全社管理者");
    expect(await errorOf(resetMemberPassword, { id: both.id })).toContain("全社管理者");
    // 名前・メールは変えられないが、自分の部署のチェックは外せる
    expect(
      await errorOf(saveMember, { id: both.id, name: "変えようとした名前", email: "x@example.test" }),
    ).toBeNull();
    const bothAfter = await personOf(OTHER);
    expect(bothAfter.employee.name).toBe(`${P}兼任`);
    expect(bothAfter.user.memberships.map((m) => m.tenantId)).toEqual([shopB.tenantId]);

    expect(await errorOf(resetMemberPassword, { id: onlyA.id })).toBeNull();
    expect(await errorOf(deleteMember, { id: onlyA.id })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: NEW } })).toBeNull();
    expect(await prisma.employee.findUnique({ where: { id: onlyA.id } })).toBeNull();
  });
});

describe("まだ整っていない人を消す", () => {
  it("ログインを消す。自分・全社管理者・最後のオーナー・ほかの部署も担当するログイン（オーナーから）は消さない", async () => {
    await createUser(ADMIN, [], true);
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    const other = await createUser(OTHER, [
      { tenantId: shopA.tenantId, role: "staff", staffId: shopA.staffB.id },
    ]);
    const both = await createUser(NEW, [
      { tenantId: shopA.tenantId, role: "staff", staffId: null },
      { tenantId: shopB.tenantId, role: "staff", staffId: null },
    ]);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_A } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } });

    await loginAs(OWNER_A);
    expect(await errorOf(deleteLooseUser, { userId: owner.id })).toContain("自分");
    expect(await errorOf(deleteLooseUser, { userId: admin.id })).toContain("全社管理者");
    expect(await errorOf(deleteLooseUser, { userId: both.id })).toContain("全社管理者が消します");

    // 消したログインに付いていた予約担当は残る
    expect(await noticeOf(deleteLooseUser, { userId: other.id })).toContain("テスト担当B");
    expect(await prisma.user.findUnique({ where: { id: other.id } })).toBeNull();
    expect(await prisma.membership.count({ where: { userId: other.id } })).toBe(0);
    expect(await prisma.staff.findUnique({ where: { id: shopA.staffB.id } })).not.toBeNull();

    await loginAs(ADMIN, shopA.tenantId);
    expect(await errorOf(deleteLooseUser, { userId: owner.id })).toContain("オーナーがいなくなる");
    expect(await errorOf(deleteLooseUser, { userId: both.id })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: both.id } })).toBeNull();

    // 名簿の人につながったログイン（メンバー）は、ここからは消せない
    await errorOf(createMember, { name: `${P}メンバー`, email: NEW, tenantIds: shopA.tenantId });
    const member = await prisma.user.findUniqueOrThrow({ where: { email: NEW } });
    expect(await errorOf(deleteLooseUser, { userId: member.id })).toContain("見つかりません");
  });

  it("予約担当を消す。今日以降の予約があれば消さず、過去の予約だけなら在籍を外す。ほかの部署の分は消せない", async () => {
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    const [withPast, empty, inB] = await Promise.all([
      prisma.staff.create({ data: { tenantId: shopA.tenantId, name: `${P}予約あり` } }),
      prisma.staff.create({ data: { tenantId: shopA.tenantId, name: `${P}予約なし` } }),
      prisma.staff.create({ data: { tenantId: shopB.tenantId, name: `${P}ほかの部署` } }),
    ]);
    const reservation = await prisma.reservation.create({
      data: {
        tenantId: shopA.tenantId,
        staffId: withPast.id,
        customerId: shopA.customer.id,
        menuId: shopA.cut.id,
        date: TEST_DATE,
        startMinutes: 600,
        endMinutes: 675,
        menuNameSnapshot: "カット",
        durationSnapshot: 60,
        priceSnapshot: 4000,
      },
    });

    await loginAs(OWNER_A);
    expect(await errorOf(deleteLooseStaff, { staffId: inB.id })).toContain("見つかりません");
    expect(await errorOf(deleteLooseStaff, { staffId: withPast.id })).toContain("今日以降の予約が1件");

    await prisma.reservation.update({ where: { id: reservation.id }, data: { date: "2020-01-01" } });
    expect(await noticeOf(deleteLooseStaff, { staffId: withPast.id })).toContain("在籍を外しました");
    expect(await prisma.staff.findUnique({ where: { id: withPast.id } })).toMatchObject({ isActive: false });

    expect(await errorOf(deleteLooseStaff, { staffId: empty.id })).toBeNull();
    expect(await prisma.staff.findUnique({ where: { id: empty.id } })).toBeNull();
  });
});
