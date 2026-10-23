/**
 * event-booking.ts（イベントの申し込み・キャンセル）を開発用 DB で確かめる。
 * 特に、同時に申し込まれても定員を超えないこと。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { applyToEvent, cancelEntryByShop, cancelOwnEntry, countBooked } from "./event-booking";
import { prisma } from "./prisma";
import {
  OPEN,
  TEST_DATE,
  type TestShop,
  createTestShop,
  deleteLeftoverTestShops,
  deleteTestShop,
} from "@/test/db-fixture";

let shop: TestShop;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("event");
});

afterEach(async () => {
  await prisma.eventEntry.deleteMany({ where: { tenantId: shop.tenantId } });
  await prisma.event.deleteMany({ where: { tenantId: shop.tenantId } });
  await prisma.customer.deleteMany({
    where: { tenantId: shop.tenantId, id: { not: shop.customer.id } },
  });
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await prisma.$disconnect();
});

function createEvent(opts: { capacity?: number; isOpen?: boolean; date?: string } = {}) {
  return prisma.event.create({
    data: {
      tenantId: shop.tenantId,
      title: "就活支援説明会",
      date: opts.date ?? TEST_DATE,
      startMinutes: OPEN,
      endMinutes: OPEN + 90,
      capacity: opts.capacity ?? 2,
      isOpen: opts.isOpen ?? true,
    },
  });
}

let seq = 0;
function createCustomer() {
  return prisma.customer.create({ data: { tenantId: shop.tenantId, name: `参加者${++seq}` } });
}

describe("applyToEvent", () => {
  it("定員までは申し込めて、超えたら満席になる", async () => {
    const event = await createEvent({ capacity: 2 });
    const [a, b, c] = [await createCustomer(), await createCustomer(), await createCustomer()];

    for (const customer of [a, b]) {
      const r = await applyToEvent({ tenantId: shop.tenantId, customerId: customer.id, eventId: event.id });
      expect(r.ok).toBe(true);
    }
    const full = await applyToEvent({ tenantId: shop.tenantId, customerId: c.id, eventId: event.id });

    expect(full).toEqual({ ok: false, message: "申し訳ありません、満席になりました" });
    expect(await countBooked(event.id)).toBe(2);
  });

  it("同じ人の2回目の申し込みは断る", async () => {
    const event = await createEvent();
    const a = await createCustomer();
    await applyToEvent({ tenantId: shop.tenantId, customerId: a.id, eventId: event.id });

    const again = await applyToEvent({ tenantId: shop.tenantId, customerId: a.id, eventId: event.id });

    expect(again).toEqual({ ok: false, message: "すでにお申し込み済みです" });
    expect(await countBooked(event.id)).toBe(1);
  });

  it("キャンセルした人は、同じ申し込みを戻してもう一度申し込める", async () => {
    const event = await createEvent();
    const a = await createCustomer();
    const first = await applyToEvent({ tenantId: shop.tenantId, customerId: a.id, eventId: event.id });
    if (!first.ok) throw new Error(first.message);
    await cancelOwnEntry({ tenantId: shop.tenantId, customerId: a.id, entryId: first.entryId });

    const again = await applyToEvent({ tenantId: shop.tenantId, customerId: a.id, eventId: event.id });

    expect(again).toEqual({ ok: true, entryId: first.entryId });
    expect(await countBooked(event.id)).toBe(1);
  });

  it("受付を止めているイベント・ほかの店舗のイベントには申し込めない", async () => {
    const closed = await createEvent({ isOpen: false });
    const a = await createCustomer();
    expect(await applyToEvent({ tenantId: shop.tenantId, customerId: a.id, eventId: closed.id })).toMatchObject({
      ok: false,
    });

    const other = await createTestShop("event-other");
    try {
      const open = await createEvent();
      const r = await applyToEvent({ tenantId: other.tenantId, customerId: other.customer.id, eventId: open.id });
      expect(r).toEqual({ ok: false, message: "このイベントは受付をしていません" });
    } finally {
      await deleteTestShop(other.tenantId);
    }
  });

  it("締め切り（開始の何分前まで）を過ぎたら申し込めない", async () => {
    const event = await createEvent();
    const a = await createCustomer();
    // 開始の1分前。テスト用の店舗の締め切りは既定の120分前
    const now = new Date(`${TEST_DATE}T${String(OPEN / 60 - 9).padStart(2, "0")}:59:00Z`);

    const r = await applyToEvent({ tenantId: shop.tenantId, customerId: a.id, eventId: event.id, now });

    expect(r).toEqual({ ok: false, message: "申し込みの受付は終了しました" });
  });

  it("同時に大勢が申し込んでも、定員を超えない", async () => {
    const event = await createEvent({ capacity: 3 });
    const customers = await Promise.all(Array.from({ length: 8 }, () => createCustomer()));

    const results = await Promise.all(
      customers.map((c) => applyToEvent({ tenantId: shop.tenantId, customerId: c.id, eventId: event.id })),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(await countBooked(event.id)).toBe(3);
  });
});

describe("キャンセル", () => {
  it("自分の申し込みだけキャンセルでき、2回目は changed: false", async () => {
    const event = await createEvent();
    const [a, b] = [await createCustomer(), await createCustomer()];
    const entry = await applyToEvent({ tenantId: shop.tenantId, customerId: a.id, eventId: event.id });
    if (!entry.ok) throw new Error(entry.message);

    const byOther = await cancelOwnEntry({ tenantId: shop.tenantId, customerId: b.id, entryId: entry.entryId });
    expect(byOther).toMatchObject({ ok: false });

    const first = await cancelEntryByShop({ tenantId: shop.tenantId, entryId: entry.entryId });
    const second = await cancelEntryByShop({ tenantId: shop.tenantId, entryId: entry.entryId });
    expect(first).toEqual({ ok: true, changed: true });
    expect(second).toEqual({ ok: true, changed: false });
    expect(await countBooked(event.id)).toBe(0);
  });
});
