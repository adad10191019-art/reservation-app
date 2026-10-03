/**
 * booking-any-staff.ts（担当を指名しない予約の振り分け）を開発用 DB で確かめる。npm run test:db で流す。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { bookAsCustomer } from "./booking";
import { bookAsCustomerAnyStaff } from "./booking-any-staff";
import { prisma } from "./prisma";
import {
  OPEN,
  TEST_DATE,
  type TestShop,
  createTestShop,
  deleteLeftoverTestShops,
  deleteTestShop,
} from "@/test/db-fixture";

// 2099-01-05 の2日前（日本時間 2099-01-03 09:00）
const NOW = new Date("2099-01-03T00:00:00Z");

let shop: TestShop;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("booking-any-staff");
});

afterEach(async () => {
  await prisma.reservation.deleteMany({ where: { tenantId: shop.tenantId } });
  await prisma.block.deleteMany({ where: { tenantId: shop.tenantId } });
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await prisma.$disconnect();
});

/** 渡した順に値を返す、決まった「くじ」（空いている人は A, B の順に並ぶ） */
function lots(...values: number[]) {
  let i = 0;
  return () => values[i++];
}

function bookAny(startMinutes: number, random?: () => number, now = NOW) {
  return bookAsCustomerAnyStaff({
    tenantId: shop.tenantId,
    customerId: shop.customer.id,
    date: TEST_DATE,
    menuId: shop.cut.id,
    startMinutes,
    now,
    random,
  });
}

/** 指名して1件入れる（その日の件数を作るため） */
async function bookFor(staffId: string, startMinutes: number) {
  const r = await bookAsCustomer({
    tenantId: shop.tenantId,
    customerId: shop.customer.id,
    date: TEST_DATE,
    menuId: shop.cut.id,
    staffId,
    startMinutes,
    now: NOW,
  });
  if (!r.ok) throw new Error(r.message);
}

describe("bookAsCustomerAnyStaff", () => {
  it("その日の予約が少ない人に入る（くじで A が先でも）", async () => {
    await bookFor(shop.staffA.id, 15 * 60);

    const r = await bookAny(OPEN, lots(0.1, 0.9));
    expect(r).toMatchObject({ ok: true, staffId: shop.staffB.id });
  });

  it("件数が同じならくじで決まる（並び順の上の人に偏らない）", async () => {
    expect(await bookAny(OPEN, lots(0.9, 0.1))).toMatchObject({ ok: true, staffId: shop.staffB.id });
    // A・B とも1件ずつになった
    expect(await bookAny(13 * 60, lots(0.1, 0.9))).toMatchObject({ ok: true, staffId: shop.staffA.id });
  });

  it("その時間に空いている人だけから選ぶ（件数が多くても、空いているのがその人だけならその人）", async () => {
    await bookFor(shop.staffA.id, 15 * 60);
    await prisma.block.create({
      data: {
        tenantId: shop.tenantId,
        staffId: shop.staffB.id,
        date: TEST_DATE,
        startMinutes: OPEN,
        endMinutes: OPEN + 120,
        reason: "研修",
      },
    });

    expect(await bookAny(OPEN)).toMatchObject({ ok: true, staffId: shop.staffA.id });
  });

  it("誰も空いていなければ取れない", async () => {
    await bookFor(shop.staffA.id, OPEN);
    await bookFor(shop.staffB.id, OPEN);

    expect(await bookAny(OPEN)).toEqual({
      ok: false,
      message: "その時間はご予約いただけなくなりました。お手数ですが選び直してください",
    });
  });

  it("受付の締め切りを過ぎていれば、担当を探さずに断る", async () => {
    const r = await bookAny(OPEN, undefined, new Date("2099-01-05T00:30:00Z")); // 日本時間 9:30
    expect(r.ok).toBe(false);
    expect(await prisma.reservation.count({ where: { tenantId: shop.tenantId } })).toBe(0);
  });
});
