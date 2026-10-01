/**
 * 1人1アカウント（兼任の人も同じアカウントで、担当部署を切り替えて使う）を開発用 DB で確かめる。
 * npm run test:db で流す。
 *
 *   ・兼任の人は1つのログインで両方の部署に入れ、役割・スタッフは部署ごとに決まる
 *   ・担当していない部署には切り替えられない。担当から外されると、ログイン中でもすぐ入れない
 *   ・オーナーが別の部署の人のメールを入れると、同じアカウントへの兼任の追加になる
 *   ・オーナーは、ほかの部署も担当している人のパスワードを初期状態に戻せない
 *
 * Cookie・画面移動・再描画は Next.js の外では動かないので差し替える（member-login.db.test.ts と同じ）。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { type TestShop, createTestShop, deleteLeftoverTestShops, deleteTestShop } from "@/test/db-fixture";

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
const { createAccount, deleteAccount, resetAccountPassword } = await import("./settings-actions");
const { requireSession } = await import("./auth");
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

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function errorOf(action: (f: FormData) => Promise<void>, fields: Record<string, string>) {
  const url = await redirectOf(() => action(form(fields)));
  return new URL(url, "http://x").searchParams.get("error");
}

const PASSWORD = "password-for-test";
const BOTH = "one-account-both@example.test";
const OWNER_A = "one-account-owner-a@example.test";
const NEW_STAFF = "one-account-new@example.test";
const EMAILS = [BOTH, OWNER_A, NEW_STAFF];

let shopA: TestShop;
let shopB: TestShop;
let shopC: TestShop;

/** 初期パスワードの変更は済ませた状態のアカウントを作る */
async function createUser(
  email: string,
  memberships: { tenantId: string; role: "owner" | "staff"; staffId: string | null }[],
) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      memberships: { create: memberships },
    },
  });
}

async function loginAs(email: string) {
  jar.clear();
  return redirectOf(() => login(form({ email, password: PASSWORD })));
}

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shopA = await createTestShop("one-account-A");
  shopB = await createTestShop("one-account-B");
  shopC = await createTestShop("one-account-C");
});

afterEach(async () => {
  jar.clear();
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.loginAttempt.deleteMany({ where: { email: { in: EMAILS } } });
});

afterAll(async () => {
  await deleteTestShop(shopA.tenantId);
  await deleteTestShop(shopB.tenantId);
  await deleteTestShop(shopC.tenantId);
});

describe("兼任の人のログイン", () => {
  it("1つのログインで両方の部署に入れ、役割とスタッフは部署ごとに決まる", async () => {
    await createUser(BOTH, [
      { tenantId: shopA.tenantId, role: "owner", staffId: shopA.staffA.id },
      { tenantId: shopB.tenantId, role: "staff", staffId: shopB.staffB.id },
    ]);

    // 最初の担当部署（A）を開く。A ではオーナーなのでカレンダーへ
    expect(await loginAs(BOTH)).toBe("/calendar");
    expect(await requireSession()).toMatchObject({
      tenantId: shopA.tenantId,
      role: "owner",
      staffId: shopA.staffA.id,
    });

    expect(await redirectOf(() => switchTenant(form({ tenantId: shopB.tenantId })))).toBe("/calendar");
    expect(await requireSession()).toMatchObject({
      tenantId: shopB.tenantId,
      role: "staff",
      staffId: shopB.staffB.id,
    });

    // 次のログインでは、最後に選んでいた B を開く（B ではスタッフなので自分の予定へ）
    expect(await loginAs(BOTH)).toBe("/my-schedule");
    expect((await requireSession()).tenantId).toBe(shopB.tenantId);
  });

  it("担当していない部署には切り替えられない", async () => {
    await createUser(BOTH, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    await loginAs(BOTH);

    expect(await redirectOf(() => switchTenant(form({ tenantId: shopC.tenantId })))).toContain("error=");
    expect((await requireSession()).tenantId).toBe(shopA.tenantId);
  });

  it("その部署の担当から外されると、ログイン中でもすぐ入れなくなる", async () => {
    const user = await createUser(BOTH, [
      { tenantId: shopA.tenantId, role: "staff", staffId: shopA.staffA.id },
      { tenantId: shopB.tenantId, role: "staff", staffId: shopB.staffA.id },
    ]);
    await loginAs(BOTH);
    await redirectOf(() => switchTenant(form({ tenantId: shopB.tenantId })));

    await prisma.membership.deleteMany({ where: { userId: user.id, tenantId: shopB.tenantId } });
    expect(await redirectOf(() => requireSession())).toBe("/login");

    // ログインし直せば、残っている A に入れる
    await loginAs(BOTH);
    expect((await requireSession()).tenantId).toBe(shopA.tenantId);
  });
});

describe("オーナーのアカウント操作", () => {
  it("新しいメールなら初期パスワード（＝メール）で発行し、別の部署の人のメールなら兼任として足す", async () => {
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    await createUser(BOTH, [{ tenantId: shopB.tenantId, role: "staff", staffId: shopB.staffA.id }]);
    await loginAs(OWNER_A);

    // 新しい人
    expect(
      await errorOf(createAccount, { email: NEW_STAFF, role: "staff", staffId: shopA.staffA.id }),
    ).toBeNull();
    const created = await prisma.user.findUniqueOrThrow({ where: { email: NEW_STAFF } });
    expect(created.mustChangePassword).toBe(true);
    expect(await verifyPassword(NEW_STAFF, created.passwordHash)).toBe(true);

    // 別の部署の人 → 同じアカウントにこの部署を足す（パスワードは変えない）
    expect(
      await errorOf(createAccount, { email: BOTH, role: "staff", staffId: shopA.staffB.id }),
    ).toBeNull();
    const both = await prisma.user.findUniqueOrThrow({
      where: { email: BOTH },
      include: { memberships: true },
    });
    expect(both.memberships.map((m) => m.tenantId).sort()).toEqual(
      [shopA.tenantId, shopB.tenantId].sort(),
    );
    expect(both.mustChangePassword).toBe(false);
    expect(await verifyPassword(PASSWORD, both.passwordHash)).toBe(true);

    // 同じ部署に二重には足さない
    expect(await errorOf(createAccount, { email: BOTH, role: "owner", staffId: "" })).toContain(
      "すでにこの部署の担当",
    );
  });

  it("ほかの部署も担当している人のパスワードは戻せず、この部署だけの人は戻せる", async () => {
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    const both = await createUser(BOTH, [
      { tenantId: shopA.tenantId, role: "staff", staffId: shopA.staffA.id },
      { tenantId: shopB.tenantId, role: "owner", staffId: null },
    ]);
    const onlyA = await createUser(NEW_STAFF, [
      { tenantId: shopA.tenantId, role: "staff", staffId: shopA.staffB.id },
    ]);
    await loginAs(OWNER_A);

    expect(await errorOf(resetAccountPassword, { id: both.id })).toContain("全社管理者");
    expect(await errorOf(resetAccountPassword, { id: onlyA.id })).toBeNull();
    const reset = await prisma.user.findUniqueOrThrow({ where: { id: onlyA.id } });
    expect(reset.mustChangePassword).toBe(true);
    expect(await verifyPassword(NEW_STAFF, reset.passwordHash)).toBe(true);
  });

  it("担当から外すと、ほかの部署の担当は残り、どこの担当でもなくなった人はアカウントごと消える", async () => {
    await createUser(OWNER_A, [{ tenantId: shopA.tenantId, role: "owner", staffId: null }]);
    const both = await createUser(BOTH, [
      { tenantId: shopA.tenantId, role: "staff", staffId: shopA.staffA.id },
      { tenantId: shopB.tenantId, role: "staff", staffId: shopB.staffA.id },
    ]);
    const onlyA = await createUser(NEW_STAFF, [
      { tenantId: shopA.tenantId, role: "staff", staffId: shopA.staffB.id },
    ]);
    await loginAs(OWNER_A);

    expect(await errorOf(deleteAccount, { id: both.id })).toBeNull();
    const rest = await prisma.membership.findMany({ where: { userId: both.id } });
    expect(rest.map((m) => m.tenantId)).toEqual([shopB.tenantId]);

    expect(await errorOf(deleteAccount, { id: onlyA.id })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: onlyA.id } })).toBeNull();
  });
});
