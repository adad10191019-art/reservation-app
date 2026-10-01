/**
 * 1人1アカウント（兼任の人も同じアカウントで、担当部署を切り替えて使う）を開発用 DB で確かめる。
 * npm run test:db で流す。
 *
 *   ・兼任の人は1つのログインで両方の部署に入れ、役割・スタッフは部署ごとに決まる
 *   ・担当していない部署には切り替えられない。担当から外されると、ログイン中でもすぐ入れない
 *   （メンバーの登録・兼任の追加・パスワードを戻す操作は member-actions.db.test.ts）
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
const { requireSession } = await import("./auth");
const { hashPassword } = await import("./password");

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

const PASSWORD = "password-for-test";
const BOTH = "one-account-both@example.test";
const EMAILS = [BOTH];

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
