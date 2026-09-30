/**
 * calendar-actions.ts（カレンダーのドラッグ移動）を開発用 DB で確かめる。
 *
 * ログイン状態（Cookie）と画面の再描画は Next.js の外では動かないので、
 * requireSession と revalidatePath だけ差し替える。DB への読み書きは本物。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "./session";
import { prisma } from "./prisma";
import {
  OPEN,
  TEST_DATE,
  TEST_DATE_2,
  type TestShop,
  createTestShop,
  deleteLeftoverTestShops,
  deleteTestShop,
} from "@/test/db-fixture";

const session = vi.hoisted(() => ({ current: null as SessionData | null }));

vi.mock("./auth", () => ({
  requireSession: async () => {
    if (!session.current) throw new Error("テストでログイン状態を入れ忘れています");
    return session.current;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { moveReservationByDrag } = await import("./calendar-actions");

let shop: TestShop;
let other: TestShop;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("calendar-actions");
  other = await createTestShop("calendar-actions（別の店舗）");
});

beforeEach(() => {
  session.current = {
    userId: "test-owner",
    tenantId: shop.tenantId,
    role: "owner",
    staffId: null,
    name: "テストオーナー",
    exp: Date.now() + 60_000,
  };
});

afterEach(async () => {
  for (const tenantId of [shop.tenantId, other.tenantId]) {
    await prisma.reservation.deleteMany({ where: { tenantId } });
    await prisma.changeLog.deleteMany({ where: { tenantId } });
  }
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await deleteTestShop(other.tenantId);
  await prisma.$disconnect();
});

/** A の担当でカットの予約を直接入れる */
function insertReservation(tenant: TestShop, startMinutes: number) {
  return prisma.reservation.create({
    data: {
      tenantId: tenant.tenantId,
      staffId: tenant.staffA.id,
      customerId: tenant.customer.id,
      menuId: tenant.cut.id,
      date: TEST_DATE,
      startMinutes,
      endMinutes: startMinutes + 75,
      menuNameSnapshot: "カット",
      durationSnapshot: 60,
      priceSnapshot: 4000,
    },
  });
}

describe("moveReservationByDrag", () => {
  it("動かせたら予約が変わり、変更履歴に移動前後が残る", async () => {
    const r = await insertReservation(shop, OPEN);

    const result = await moveReservationByDrag({
      reservationId: r.id,
      date: TEST_DATE_2,
      startMinutes: OPEN + 60,
      staffId: shop.staffB.id,
    });
    expect(result).toEqual({ ok: true });

    const saved = await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(saved).toMatchObject({ date: TEST_DATE_2, startMinutes: OPEN + 60, staffId: shop.staffB.id });

    const logs = await prisma.changeLog.findMany({ where: { tenantId: shop.tenantId } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "reservation", action: "moved", actorName: "テストオーナー" });
    expect(logs[0].summary).toContain("テスト顧客");
    expect(logs[0].summary).toContain("テスト担当A");
    expect(logs[0].summary).toContain("テスト担当B");
  });

  it("動かせなかったら予約も履歴も変わらない", async () => {
    const r = await insertReservation(shop, OPEN);
    await insertReservation(shop, OPEN + 120);

    const result = await moveReservationByDrag({
      reservationId: r.id,
      date: TEST_DATE,
      startMinutes: OPEN + 90,
      staffId: shop.staffA.id,
    });
    expect(result).toEqual({ ok: false, message: "この枠は、ちょうど今ほかの予約で埋まりました" });

    const saved = await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(saved.startMinutes).toBe(OPEN);
    expect(await prisma.changeLog.count({ where: { tenantId: shop.tenantId } })).toBe(0);
  });

  it("スタッフは他人の担当の予約を動かせない", async () => {
    const r = await insertReservation(shop, OPEN); // A の担当
    session.current = { ...session.current!, role: "staff", staffId: shop.staffB.id };

    const result = await moveReservationByDrag({
      reservationId: r.id,
      date: TEST_DATE,
      startMinutes: OPEN + 120,
      staffId: shop.staffB.id,
    });
    expect(result).toEqual({ ok: false, message: "自分の担当分の予約のみ操作できます" });
  });

  it("ログイン中の店舗と違う店舗の予約は動かせない", async () => {
    const r = await insertReservation(other, OPEN);

    const result = await moveReservationByDrag({
      reservationId: r.id,
      date: TEST_DATE,
      startMinutes: OPEN + 120,
      staffId: shop.staffA.id,
    });
    expect(result).toEqual({ ok: false, message: "予約が見つかりません" });

    const saved = await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(saved).toMatchObject({ tenantId: other.tenantId, startMinutes: OPEN });
  });
});
