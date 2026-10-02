/**
 * 部署に属さない社員のログイン（担当部署の無いアカウント）を開発用 DB で確かめる。npm run test:db で流す。
 *
 *   ・設定→メンバー で部署なしの人として登録・パスワードを戻す・登録の取り消し（member-actions.ts）
 *   ・最初のパスワードはメールアドレスと同じで、変えるまで変更の画面以外を開けない
 *   ・ログインすると「全社の1日」へ。部署の画面の入口（requireSession）は「全社の1日」へ回す
 *   ・退職にすると、ログイン中でも入れなくなる
 *
 * Cookie・画面移動・再描画は Next.js の外では動かないので差し替える。
 * Cookie は1つの入れ物で持ち回り、redirect は行き先を例外にして受け取る。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import {
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
// メンバーの操作は全社管理者のログインが前提。ここでは確認を省き、それ以外の入口は本物を使う
vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth")>()),
  requireOwner: async () => ({ role: "group_admin", tenantId: shop.tenantId, userId: "test-admin", name: "" }),
}));

class Redirected extends Error {
  constructor(readonly url: string) {
    super(url);
  }
}

process.env.AUTH_SECRET ??= "test-secret-at-least-16-chars";

const { createMember, deleteMember, resetMemberPassword, retireMember } = await import("./member-actions");
const { login } = await import("./actions");
const { setFirstPassword } = await import("./account-actions");
const { FIRST_PASSWORD_PATH, requireSession, requireTeamSession } = await import("./auth");
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

const NAME = "[自動テスト] 事務 花子";

/** 部署なしの人として登録し、名簿の行を返す */
async function registerTeamOnly(email = EMAIL, name = NAME) {
  expect(await errorOf(createMember, { name, email })).toBeNull();
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { employee: true } });
  return user.employee!;
}

/** 最初のパスワードの変更を済ませた状態にする */
async function skipFirstPassword(email = EMAIL) {
  await prisma.user.update({
    where: { email },
    data: { passwordHash: await hashPassword(PASSWORD), mustChangePassword: false },
  });
}

describe("部署なしの人の登録", () => {
  it("最初はメールアドレスで入り、パスワードを変えるまでは変更の画面にしか行けない", async () => {
    const e = await registerTeamOnly();

    // 初期パスワード＝メールアドレス
    expect(await redirectOf(() => login(form({ email: EMAIL, password: EMAIL })))).toBe(FIRST_PASSWORD_PATH);
    expect(await redirectOf(() => requireTeamSession())).toBe(FIRST_PASSWORD_PATH);

    // メールと同じ・確認と食い違うパスワードは受け付けない
    const firstError = async (fields: Record<string, string>) =>
      new URL(await redirectOf(() => setFirstPassword(form(fields))), "http://x").searchParams.get("error");
    expect(await firstError({ newPassword: EMAIL, confirmPassword: EMAIL })).toContain("メールアドレスと同じ");
    expect(await firstError({ newPassword: PASSWORD, confirmPassword: "other-password" })).toContain("一致しません");

    expect(await redirectOf(() => setFirstPassword(form({ newPassword: PASSWORD, confirmPassword: PASSWORD })))).toBe(
      "/team",
    );
    const session = await requireTeamSession();
    expect(session).toMatchObject({ role: "member", tenantId: null, name: e.name });
    expect(await redirectOf(() => requireSession())).toBe("/team");

    // 変えたあとは、新しいパスワードでだけ入れる
    jar.clear();
    expect(await redirectOf(() => login(form({ email: EMAIL, password: EMAIL })))).toContain("error=");
    expect(await redirectOf(() => login(form({ email: EMAIL, password: PASSWORD })))).toBe("/team");
  });

  it("退職にすると、ログイン中でも入れなくなり、ログインもできない", async () => {
    const e = await registerTeamOnly();
    await skipFirstPassword();
    await redirectOf(() => login(form({ email: EMAIL, password: PASSWORD })));

    expect(await errorOf(retireMember, { id: e.id })).toBeNull();
    expect(await redirectOf(() => requireTeamSession())).toBe("/login");

    jar.clear();
    const url = await redirectOf(() => login(form({ email: EMAIL, password: PASSWORD })));
    expect(url).toContain("/login?error=");
  });

  it("形式の違うメール・同じ名前の別人は登録しない", async () => {
    expect(await errorOf(createMember, { name: NAME, email: "not-an-email" })).toContain("形式");
    await registerTeamOnly(DEPT_EMAIL);
    expect(await errorOf(createMember, { name: NAME, email: EMAIL })).toContain("同じ名前");
  });
});

describe("パスワードを戻す・登録の取り消し", () => {
  it("戻すとメールアドレスで入れて変更の画面へ。取り消すとログインごと消えて入れない", async () => {
    const e = await registerTeamOnly();
    await skipFirstPassword();

    expect(await errorOf(resetMemberPassword, { id: e.id })).toBeNull();
    expect(await redirectOf(() => login(form({ email: EMAIL, password: PASSWORD })))).toContain("error=");
    expect(await redirectOf(() => login(form({ email: EMAIL, password: EMAIL })))).toBe(FIRST_PASSWORD_PATH);

    expect(await errorOf(deleteMember, { id: e.id })).toBeNull();
    expect(await redirectOf(() => requireTeamSession())).toBe("/login");
    expect(await prisma.user.findUnique({ where: { email: EMAIL } })).toBeNull();
    expect(await prisma.employee.findUnique({ where: { id: e.id } })).toBeNull();
  });
});
