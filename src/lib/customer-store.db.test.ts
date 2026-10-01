/**
 * customer-store.ts（お客様の登録と、確認画面で入力した名前の保存）を開発用 DB で確かめる。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveCustomerProfile, upsertEmailCustomer, upsertLineCustomer } from "./customer-store";
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
  shop = await createTestShop("customer-store");
  other = await createTestShop("customer-store（別の店舗）");
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await deleteTestShop(other.tenantId);
  await prisma.$disconnect();
});

const find = (id: string) => prisma.customer.findUniqueOrThrow({ where: { id } });

describe("upsertLineCustomer と saveCustomerProfile", () => {
  it("初回は LINE の表示名を name と lineDisplayName の両方に入れ、本名は未入力", async () => {
    const c = await upsertLineCustomer({
      tenantId: shop.tenantId,
      lineUserId: "U-first",
      displayName: "★はな★",
    });
    const row = await find(c.id);
    expect(row.name).toBe("★はな★");
    expect(row.lineDisplayName).toBe("★はな★");
    expect(row.nameEnteredAt).toBeNull();
  });

  it("本名を入力する前は、表示名が変わると name も追従する", async () => {
    const c = await upsertLineCustomer({
      tenantId: shop.tenantId,
      lineUserId: "U-first",
      displayName: "はな🌸",
    });
    expect(c.name).toBe("はな🌸");
    const row = await find(c.id);
    expect(row.name).toBe("はな🌸");
    expect(row.lineDisplayName).toBe("はな🌸");
  });

  it("本名を入力した後は、LINE でログインし直しても name は上書きされない", async () => {
    const c = await upsertLineCustomer({
      tenantId: shop.tenantId,
      lineUserId: "U-first",
      displayName: "はな🌸",
    });
    const saved = await saveCustomerProfile({
      tenantId: shop.tenantId,
      customerId: c.id,
      name: "山田 花子",
      phone: "090-1234-5678",
    });
    expect(saved).toBe(true);

    const again = await upsertLineCustomer({
      tenantId: shop.tenantId,
      lineUserId: "U-first",
      displayName: "hana",
    });
    expect(again.name).toBe("山田 花子");

    const row = await find(c.id);
    expect(row.name).toBe("山田 花子");
    expect(row.phone).toBe("090-1234-5678");
    expect(row.lineDisplayName).toBe("hana");
    expect(row.nameEnteredAt).not.toBeNull();
  });

  it("電話番号を空にして保存すると、登録済みの番号も消える", async () => {
    const c = await upsertLineCustomer({
      tenantId: shop.tenantId,
      lineUserId: "U-first",
      displayName: "hana",
    });
    await saveCustomerProfile({
      tenantId: shop.tenantId,
      customerId: c.id,
      name: "山田 花子",
      phone: null,
    });
    expect((await find(c.id)).phone).toBeNull();
  });

  it("別の店舗の ID を指定しても書き換えられない", async () => {
    const c = await upsertLineCustomer({
      tenantId: shop.tenantId,
      lineUserId: "U-first",
      displayName: "hana",
    });
    const saved = await saveCustomerProfile({
      tenantId: other.tenantId,
      customerId: c.id,
      name: "なりすまし",
      phone: null,
    });
    expect(saved).toBe(false);
    expect((await find(c.id)).name).toBe("山田 花子");
  });
});

describe("upsertEmailCustomer", () => {
  it("メールログインで入力した名前は、本名の入力済みとして扱う", async () => {
    const c = await upsertEmailCustomer({
      tenantId: shop.tenantId,
      email: "hanako@example.com",
      name: "佐藤 花子",
    });
    const row = await find(c.id);
    expect(row.name).toBe("佐藤 花子");
    expect(row.nameEnteredAt).not.toBeNull();
  });

  it("ログインし直して別の名前を入れたら、その名前に変わる", async () => {
    const c = await upsertEmailCustomer({
      tenantId: shop.tenantId,
      email: "hanako@example.com",
      name: "佐藤 華子",
    });
    expect((await find(c.id)).name).toBe("佐藤 華子");
  });
});
