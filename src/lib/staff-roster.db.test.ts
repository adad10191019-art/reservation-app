/**
 * オーナーが「設定 → スタッフ」でスタッフを追加したとき、社員名簿にも自動で載ることを
 * 開発用 DB で確かめる（settings-actions.ts の saveStaff → employee-roster.ts）。npm run test:db で流す。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionData } from "./session";
import { prisma } from "./prisma";
import {
  type TestShop,
  createTestShop,
  deleteLeftoverTestShops,
  deleteTestEmployees,
  deleteTestShop,
} from "@/test/db-fixture";

const session = vi.hoisted(() => ({ current: null as SessionData | null }));

vi.mock("./auth", () => ({
  requireOwner: async () => session.current,
  requireSession: async () => session.current,
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

const { saveStaff } = await import("./settings-actions");

/** shop の オーナーとしてスタッフを追加し、戻り先の notice を返す */
async function addStaff(shop: TestShop, name: string): Promise<string | null> {
  session.current = {
    userId: "test-owner",
    tenantId: shop.tenantId,
    role: "owner",
    staffId: null,
    name: "テストオーナー",
    exp: Date.now() + 60_000,
  };
  const form = new FormData();
  form.set("name", name);
  form.set("displayOrder", "9");
  form.set("isActive", "on");
  try {
    await saveStaff(form);
  } catch (e) {
    if (!(e instanceof Redirected)) throw e;
    const params = new URL(e.url, "http://x").searchParams;
    expect(params.get("error")).toBeNull();
    return params.get("notice");
  }
  throw new Error("redirect されませんでした");
}

const NAME = "[自動テスト] 新人 一郎";

let shop: TestShop;
let other: TestShop;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("staff-roster");
  other = await createTestShop("staff-roster（兼任先）");
});

afterEach(async () => {
  await deleteTestEmployees();
  await prisma.staff.deleteMany({
    where: { tenantId: { in: [shop.tenantId, other.tenantId] }, name: { startsWith: "[自動テスト]" } },
  });
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await deleteTestShop(other.tenantId);
});

describe("スタッフを追加すると社員名簿にも載る", () => {
  it("名簿にいなければ作り、2つ目の部署で同じ名前を追加すると同じ人（兼任）にまとまる", async () => {
    expect(await addStaff(shop, NAME)).toContain("登録しました");
    const employees = await prisma.employee.findMany({ where: { name: NAME } });
    expect(employees).toHaveLength(1);

    expect(await addStaff(other, "[自動テスト]　新人一郎")).toContain("ひも付けました");
    expect(await prisma.employee.count({ where: { name: { startsWith: "[自動テスト]" } } })).toBe(1);
    expect(await prisma.staff.count({ where: { employeeId: employees[0].id } })).toBe(2);
  });

  it("同じ部署に同じ名前の2人目を作っても、同じ人にはひも付けない", async () => {
    await addStaff(shop, NAME);
    expect(await addStaff(shop, NAME)).toContain("載せていません");

    const staffs = await prisma.staff.findMany({ where: { tenantId: shop.tenantId, name: NAME } });
    expect(staffs.filter((s) => s.employeeId !== null)).toHaveLength(1);
  });
});
