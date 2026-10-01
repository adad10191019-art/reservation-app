/**
 * 部署に属さない社員のログイン（role "member"）を開発用 DB で確かめる。npm run test:db で流す。
 *
 *   ・名簿の画面からの発行・再設定・取り消し（employee-actions.ts）
 *   ・ログインすると「全社の1日」へ。部署の画面の入口（requireSession）は「全社の1日」へ回す
 *   ・名簿で在籍を外すと、ログイン中でも入れなくなる
 *
 * Cookie・画面移動・再描画は Next.js の外では動かないので差し替える。
 * Cookie は1つの入れ物で持ち回り、redirect は行き先を例外にして受け取る。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import {
  type TestShop,
  createTestEmployee,
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
// 名簿の操作は全社管理者のログインが前提。ここでは確認を省き、それ以外の入口は本物を使う
vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth")>()),
  requireGroupAdmin: async () => ({}),
}));

class Redirected extends Error {
  constructor(readonly url: string) {
    super(url);
  }
}

process.env.AUTH_SECRET ??= "test-secret-at-least-16-chars";

const { issueMemberLogin, resetMemberPassword, revokeMemberLogin, deleteEmployee } = await import(
  "./employee-actions"
);
const { login } = await import("./actions");
const { requireSession, requireTeamSession } = await import("./auth");
const { hashPassword } = await import("./password");

/** 処理を呼んで、redirect の行き先を返す */
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

/** 戻り先のエラー文（成功なら null） */
async function errorOf(action: (f: FormData) => Promise<void>, fields: Record<string, string>) {
  const url = await redirectOf(() => action(form(fields)));
  return new URL(url, "http://x").searchParams.get("error");
}

const EMAIL = "member-login-test@example.test";
const DEPT_EMAIL = "member-login-dept-test@example.test";
const PASSWORD = "password-for-test";

let shop: TestShop;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("member-login");
});

afterEach(async () => {
  jar.clear();
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, DEPT_EMAIL] } } });
  await prisma.loginAttempt.deleteMany({ where: { email: { in: [EMAIL, DEPT_EMAIL] } } });
  await deleteTestEmployees();
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
});

describe("ログインの発行", () => {
  it("発行した社員はログインすると「全社の1日」へ行き、部署の画面からも「全社の1日」へ回される", async () => {
    const e = await createTestEmployee("事務 花子");
    expect(await errorOf(issueMemberLogin, { id: e.id, email: EMAIL, password: PASSWORD })).toBeNull();

    expect(await redirectOf(() => login(form({ email: EMAIL, password: PASSWORD })))).toBe("/team");

    const session = await requireTeamSession();
    expect(session).toMatchObject({ role: "member", tenantId: null, name: e.name });
    expect(await redirectOf(() => requireSession())).toBe("/team");
  });

  it("在籍を外すと、ログイン中でも入れなくなり、ログインもできない", async () => {
    const e = await createTestEmployee("退職予定");
    await errorOf(issueMemberLogin, { id: e.id, email: EMAIL, password: PASSWORD });
    await redirectOf(() => login(form({ email: EMAIL, password: PASSWORD })));

    await prisma.employee.update({ where: { id: e.id }, data: { isActive: false } });
    expect(await redirectOf(() => requireTeamSession())).toBe("/login");

    jar.clear();
    const url = await redirectOf(() => login(form({ email: EMAIL, password: PASSWORD })));
    expect(url).toContain("/login?error=");
  });

  it("ほかのアカウントと同じメール・部署のアカウントを持つ人・短いパスワードには発行しない", async () => {
    const e = await createTestEmployee("兼任の人");
    await prisma.user.create({
      data: {
        tenantId: shop.tenantId,
        email: DEPT_EMAIL,
        passwordHash: await hashPassword(PASSWORD),
        role: "staff",
        staffId: shop.staffA.id,
      },
    });

    expect(await errorOf(issueMemberLogin, { id: e.id, email: DEPT_EMAIL, password: PASSWORD })).toContain(
      "使われています",
    );
    expect(await errorOf(issueMemberLogin, { id: e.id, email: EMAIL, password: "short" })).toContain("8文字");

    await prisma.staff.update({ where: { id: shop.staffA.id }, data: { employeeId: e.id } });
    expect(await errorOf(issueMemberLogin, { id: e.id, email: EMAIL, password: PASSWORD })).toContain(
      "発行は不要",
    );
  });
});

describe("再設定・取り消し", () => {
  it("再設定すると新しいパスワードで入れ、取り消すと入れない。ログインがある間は名簿の行を消せない", async () => {
    const e = await createTestEmployee("事務 次郎");
    await errorOf(issueMemberLogin, { id: e.id, email: EMAIL, password: PASSWORD });
    expect(await errorOf(deleteEmployee, { id: e.id })).toContain("ログインがある");

    const next = "new-password-123";
    expect(await errorOf(resetMemberPassword, { id: e.id, password: next })).toBeNull();
    expect(await redirectOf(() => login(form({ email: EMAIL, password: PASSWORD })))).toContain("error=");
    expect(await redirectOf(() => login(form({ email: EMAIL, password: next })))).toBe("/team");

    expect(await errorOf(revokeMemberLogin, { id: e.id })).toBeNull();
    expect(await redirectOf(() => requireTeamSession())).toBe("/login");
    expect(await errorOf(deleteEmployee, { id: e.id })).toBeNull();
  });
});
