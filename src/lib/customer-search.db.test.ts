/**
 * customer-search.ts（予約登録画面の顧客検索）を開発用 DB で確かめる。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchCustomerCandidates } from "./customer-search";
import { prisma } from "./prisma";
import {
  type TestShop,
  createTestShop,
  deleteLeftoverTestShops,
  deleteTestShop,
} from "@/test/db-fixture";

let shop: TestShop;
let other: TestShop;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("customer-search");
  other = await createTestShop("customer-search（別の店舗）");

  await prisma.customer.createMany({
    data: [
      { tenantId: shop.tenantId, name: "山田 花子", phone: "090-1111-2222" },
      { tenantId: shop.tenantId, name: "山田 太郎", email: "Taro@Example.com" },
      { tenantId: shop.tenantId, name: "佐藤 一郎", phone: "080-3333-4444" },
      { tenantId: shop.tenantId, name: "鈴木 次郎", lineDisplayName: "じろー★" },
      { tenantId: other.tenantId, name: "山田 別店舗" },
    ],
  });
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await deleteTestShop(other.tenantId);
  await prisma.$disconnect();
});

const names = (r: { customers: { name: string }[] }) => r.customers.map((c) => c.name);

describe("searchCustomerCandidates", () => {
  it("名前の一部で探せ、別の店舗の顧客は出ない", async () => {
    const r = await searchCustomerCandidates(shop.tenantId, "山田");
    expect(names(r)).toEqual(["山田 太郎", "山田 花子"].sort());
    expect(r.more).toBe(false);
  });

  it("電話番号の一部・メール（大文字小文字を区別しない）でも探せる", async () => {
    expect(names(await searchCustomerCandidates(shop.tenantId, "3333"))).toEqual(["佐藤 一郎"]);
    expect(names(await searchCustomerCandidates(shop.tenantId, "taro@example"))).toEqual([
      "山田 太郎",
    ]);
  });

  it("LINE の表示名でも探せる（本名に変わった後も見つけられる）", async () => {
    expect(names(await searchCustomerCandidates(shop.tenantId, "じろー"))).toEqual(["鈴木 次郎"]);
  });

  it("空の検索語では何も返さない（全件を流さない）", async () => {
    expect(await searchCustomerCandidates(shop.tenantId, "   ")).toEqual({
      customers: [],
      more: false,
    });
  });

  it("上限を超えたら件数を絞り、続きがあることを伝える", async () => {
    const r = await searchCustomerCandidates(shop.tenantId, "山田", 1);
    expect(r.customers).toHaveLength(1);
    expect(r.more).toBe(true);
  });

  it("見つからなければ空", async () => {
    expect(names(await searchCustomerCandidates(shop.tenantId, "存在しない名前"))).toEqual([]);
  });
});
