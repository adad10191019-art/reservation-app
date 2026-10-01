/**
 * employee-actions.ts（社員名簿）を開発用 DB で確かめる。npm run test:db で流す。
 *
 * ログイン確認・画面の再描画・画面移動は Next.js の外では動かないので差し替える。
 * redirect は「どこへ戻されたか」を例外にして受け取る。
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

vi.mock("./auth", () => ({ requireGroupAdmin: async () => ({}) }));
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

const { createEmployee, deleteEmployee, linkStaffToEmployee, updateEmployee } = await import(
  "./employee-actions"
);

/** 処理を呼んで、戻り先のエラー文（成功なら null）を返す */
async function run(action: (f: FormData) => Promise<void>, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  try {
    await action(form);
  } catch (e) {
    if (!(e instanceof Redirected)) throw e;
    const error = new URL(e.url, "http://x").searchParams.get("error");
    return error;
  }
  throw new Error("redirect されませんでした");
}

const NAME = "[自動テスト] 兼任 太郎";

let shop: TestShop;
let other: TestShop;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("employee-actions");
  other = await createTestShop("employee-actions（兼任先）");
  // 2つの部署に、同じ名前のスタッフ（兼任の人）がいる
  await prisma.staff.updateMany({
    where: { id: { in: [shop.staffA.id, other.staffA.id] } },
    data: { name: NAME },
  });
});

afterEach(async () => {
  await deleteTestEmployees();
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await deleteTestShop(other.tenantId);
});

describe("名簿に新しく作る", () => {
  it("2つ目の部署で同じ名前の人を作ろうとすると止め、既存の人（所属部署つき）を案内する", async () => {
    expect(await run(linkStaffToEmployee, { staffId: shop.staffA.id, employeeId: "new" })).toBeNull();

    const error = await run(linkStaffToEmployee, { staffId: other.staffA.id, employeeId: "new" });
    expect(error).toContain(`${NAME}（${shop.tenant.name}）`);
    expect(await prisma.employee.count({ where: { name: NAME } })).toBe(1);

    // 案内どおり既存の人を選べば、兼任としてひも付く
    const employee = await prisma.employee.findFirstOrThrow({ where: { name: NAME } });
    expect(await run(linkStaffToEmployee, { staffId: other.staffA.id, employeeId: employee.id })).toBeNull();
    const linked = await prisma.staff.count({ where: { employeeId: employee.id } });
    expect(linked).toBe(2);
  });

  it("在籍を外した同名の人がいるだけなら作れる", async () => {
    await prisma.employee.create({ data: { name: NAME, isActive: false } });
    expect(await run(linkStaffToEmployee, { staffId: shop.staffA.id, employeeId: "new" })).toBeNull();
  });
});

describe("社員の追加・名前の変更", () => {
  it("空白の違いだけの同じ名前は追加できない", async () => {
    await run(createEmployee, { name: "[自動テスト] 事務 花子" });
    const error = await run(createEmployee, { name: "[自動テスト]　事務花子" });
    expect(error).toContain("すでに");
  });

  it("在籍中の別の人と同じ名前には変えられないが、在籍を外すなら変えられる", async () => {
    const a = await prisma.employee.create({ data: { name: "[自動テスト] 竹内" } });
    const b = await prisma.employee.create({ data: { name: "[自動テスト] 竹内（仮）" } });

    const error = await run(updateEmployee, { id: b.id, name: a.name, displayOrder: "0", isActive: "on" });
    expect(error).toContain("同じ名前");
    expect(await run(updateEmployee, { id: b.id, name: a.name, displayOrder: "0" })).toBeNull();
  });
});

describe("名簿の行の削除", () => {
  it("予定もひも付けも無い行は消せる", async () => {
    const e = await prisma.employee.create({ data: { name: "[自動テスト] 重複" } });
    expect(await run(deleteEmployee, { id: e.id })).toBeNull();
    expect(await prisma.employee.findUnique({ where: { id: e.id } })).toBeNull();
  });

  it("スタッフとひも付いている行・予定がある行は消せない", async () => {
    const linked = await prisma.employee.create({ data: { name: "[自動テスト] ひも付き" } });
    await prisma.staff.update({ where: { id: shop.staffB.id }, data: { employeeId: linked.id } });
    expect(await run(deleteEmployee, { id: linked.id })).toContain("ひも付いている");

    const busy = await prisma.employee.create({ data: { name: "[自動テスト] 予定あり" } });
    await prisma.employeeEvent.create({
      data: {
        employeeId: busy.id,
        date: "2099-01-05",
        startMinutes: 600,
        endMinutes: 660,
        title: "会議",
        createdByName: "テスト",
      },
    });
    expect(await run(deleteEmployee, { id: busy.id })).toContain("予定が入っている");

    expect(await prisma.employee.count({ where: { id: { in: [linked.id, busy.id] } } })).toBe(2);
  });
});
