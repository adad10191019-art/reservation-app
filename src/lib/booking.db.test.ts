/**
 * booking.ts を開発用 DB で確かめる。npm run test:db で流す。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  bookAsCustomer,
  bookReservation,
  cancelOwnReservation,
  rescheduleReservation,
  setReservationStatus,
} from "./booking";
import type { Actor } from "./permissions";
import { prisma } from "./prisma";
import {
  CLOSE,
  OPEN,
  TEST_DATE,
  TEST_DATE_2,
  type TestShop,
  createTestShop,
  deleteLeftoverTestShops,
  deleteTestShop,
} from "@/test/db-fixture";

const owner: Actor = { role: "owner", staffId: null };

let shop: TestShop;
let other: TestShop;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("booking");
  other = await createTestShop("booking（別の店舗）");
});

afterEach(async () => {
  for (const tenantId of [shop.tenantId, other.tenantId]) {
    await prisma.reservation.deleteMany({ where: { tenantId } });
    await prisma.block.deleteMany({ where: { tenantId } });
    await prisma.dateOverride.deleteMany({ where: { tenantId } });
  }
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await deleteTestShop(other.tenantId);
  await prisma.$disconnect();
});

/** カットを A の担当で取る（オーナーとして） */
function bookCut(startMinutes: number, extra: Partial<Parameters<typeof bookReservation>[0]> = {}) {
  return bookReservation({
    actor: owner,
    tenantId: shop.tenantId,
    date: TEST_DATE,
    menuId: shop.cut.id,
    staffId: shop.staffA.id,
    startMinutes,
    customerId: shop.customer.id,
    ...extra,
  });
}

function expectOk<T extends { ok: boolean }>(r: T): asserts r is Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`成功するはずが失敗: ${(r as { message?: string }).message}`);
}

describe("bookReservation（店舗側の新規登録）", () => {
  it("登録でき、終了時刻は片付け時間込み・メニューの値が控えられる", async () => {
    const r = await bookCut(OPEN);
    expectOk(r);

    const saved = await prisma.reservation.findUniqueOrThrow({ where: { id: r.reservationId } });
    expect(saved).toMatchObject({
      tenantId: shop.tenantId,
      date: TEST_DATE,
      startMinutes: OPEN,
      endMinutes: OPEN + 75,
      menuNameSnapshot: "カット",
      durationSnapshot: 60,
      priceSnapshot: 4000,
      status: "booked",
    });
  });

  it("新しい顧客を指定すると、その店舗に顧客が作られる", async () => {
    const r = await bookCut(OPEN, { customerId: undefined, newCustomer: { name: "新規さん" } });
    expectOk(r);
    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: r.reservationId },
      include: { customer: true },
    });
    expect(saved.customer).toMatchObject({ name: "新規さん", tenantId: shop.tenantId });
  });

  it("同じ枠・一部だけ重なる枠は断り、ちょうど終わった時刻からは取れる", async () => {
    expectOk(await bookCut(OPEN)); // 10:00〜11:15

    const same = await bookCut(OPEN);
    expect(same).toEqual({ ok: false, message: "この枠は、ちょうど今ほかの予約で埋まりました" });

    const overlap = await bookCut(OPEN + 60); // 11:00 開始は 11:15 まで重なる
    expect(overlap.ok).toBe(false);

    expectOk(await bookCut(OPEN + 75)); // 11:15 開始は重ならない
  });

  it("別のスタッフなら同じ時間でも取れる", async () => {
    expectOk(await bookCut(OPEN));
    expectOk(await bookCut(OPEN, { staffId: shop.staffB.id }));
  });

  it("同じ枠へ同時に5件送っても、通るのは1件だけ", async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => bookCut(OPEN + 120)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const count = await prisma.reservation.count({
      where: { tenantId: shop.tenantId, status: "booked" },
    });
    expect(count).toBe(1);
  });

  it("勤務時間外・枠の刻みずれ・担当できないメニューは断る", async () => {
    expect(await bookCut(CLOSE - 60)).toEqual({
      ok: false,
      message: "その時間は勤務時間外です",
    }); // 18:00 開始だと 19:15 まで
    expect(await bookCut(OPEN - 60)).toMatchObject({ ok: false });
    expect(await bookCut(OPEN + 5)).toEqual({
      ok: false,
      message: "開始時刻が予約枠の刻みに合っていません",
    });

    const r = await bookCut(OPEN, { menuId: shop.color.id, staffId: shop.staffB.id });
    expect(r).toEqual({ ok: false, message: "テスト担当B はこのメニューを担当できません" });
  });

  it("臨時休業の日は取れない", async () => {
    await prisma.dateOverride.create({
      data: { tenantId: shop.tenantId, staffId: null, date: TEST_DATE, isClosed: true },
    });
    expect(await bookCut(OPEN)).toEqual({ ok: false, message: "その時間は勤務時間外です" });
  });

  it("ブロック枠（会議など）と重なる時間は取れない", async () => {
    await prisma.block.create({
      data: {
        tenantId: shop.tenantId,
        staffId: null,
        date: TEST_DATE,
        startMinutes: OPEN + 30,
        endMinutes: OPEN + 60,
        reason: "朝礼",
      },
    });
    expect(await bookCut(OPEN)).toEqual({
      ok: false,
      message: "その時間は「朝礼」で塞がっています",
    });
  });

  it("スタッフは自分の担当分しか登録できない", async () => {
    const staffB: Actor = { role: "staff", staffId: shop.staffB.id };
    expect(await bookCut(OPEN, { actor: staffB })).toEqual({
      ok: false,
      message: "自分の担当分の予約のみ操作できます",
    });
    expectOk(await bookCut(OPEN, { actor: staffB, staffId: shop.staffB.id }));
  });

  it("別の店舗のメニュー・スタッフ・顧客は使えない", async () => {
    expect(await bookCut(OPEN, { menuId: other.cut.id })).toEqual({
      ok: false,
      message: "メニューが見つかりません",
    });
    expect(await bookCut(OPEN, { staffId: other.staffA.id })).toEqual({
      ok: false,
      message: "スタッフが見つかりません",
    });
    expect(await bookCut(OPEN, { customerId: other.customer.id })).toEqual({
      ok: false,
      message: "顧客が見つかりません",
    });
    // 顧客の確認で失敗したら、予約は1件も残らない
    expect(await prisma.reservation.count({ where: { tenantId: shop.tenantId } })).toBe(0);
  });
});

describe("rescheduleReservation（日時・担当の変更）", () => {
  it("空いている枠へ動かせ、長さは予約時点のまま・移動の印が付く", async () => {
    const r = await bookCut(OPEN);
    expectOk(r);

    // 予約の後でメニューを長くしても、動かした予約の長さは変わらない
    await prisma.menu.update({ where: { id: shop.cut.id }, data: { durationMinutes: 120 } });
    try {
      const moved = await rescheduleReservation({
        actor: owner,
        tenantId: shop.tenantId,
        reservationId: r.reservationId,
        date: TEST_DATE_2,
        staffId: shop.staffB.id,
        startMinutes: OPEN + 60,
      });
      expect(moved).toEqual({ ok: true });
    } finally {
      await prisma.menu.update({ where: { id: shop.cut.id }, data: { durationMinutes: 60 } });
    }

    const saved = await prisma.reservation.findUniqueOrThrow({ where: { id: r.reservationId } });
    expect(saved).toMatchObject({
      date: TEST_DATE_2,
      staffId: shop.staffB.id,
      startMinutes: OPEN + 60,
      endMinutes: OPEN + 60 + 75,
    });
    expect(saved.movedAt).not.toBeNull();
  });

  it("自分自身とだけ重なる少しのずらしはできる", async () => {
    const r = await bookCut(OPEN);
    expectOk(r);
    expect(
      await rescheduleReservation({
        actor: owner,
        tenantId: shop.tenantId,
        reservationId: r.reservationId,
        date: TEST_DATE,
        staffId: shop.staffA.id,
        startMinutes: OPEN + 15,
      }),
    ).toEqual({ ok: true });
  });

  it("ほかの予約がある枠へは動かせない", async () => {
    const first = await bookCut(OPEN);
    const second = await bookCut(OPEN + 120);
    expectOk(first);
    expectOk(second);

    const r = await rescheduleReservation({
      actor: owner,
      tenantId: shop.tenantId,
      reservationId: second.reservationId,
      date: TEST_DATE,
      staffId: shop.staffA.id,
      startMinutes: OPEN + 30,
    });
    expect(r).toEqual({ ok: false, message: "この枠は、ちょうど今ほかの予約で埋まりました" });
  });

  it("キャンセル済みの予約は動かせない", async () => {
    const r = await bookCut(OPEN);
    expectOk(r);
    await setReservationStatus({
      actor: owner,
      tenantId: shop.tenantId,
      reservationId: r.reservationId,
      status: "canceled",
    });

    expect(
      await rescheduleReservation({
        actor: owner,
        tenantId: shop.tenantId,
        reservationId: r.reservationId,
        date: TEST_DATE,
        staffId: shop.staffA.id,
        startMinutes: OPEN + 120,
      }),
    ).toEqual({ ok: false, message: "この予約は変更できません（すでに完了またはキャンセル済み）" });
  });

  it("スタッフは他人の予約を自分へ付け替えられない", async () => {
    const r = await bookCut(OPEN); // A の担当
    expectOk(r);
    const staffB: Actor = { role: "staff", staffId: shop.staffB.id };

    expect(
      await rescheduleReservation({
        actor: staffB,
        tenantId: shop.tenantId,
        reservationId: r.reservationId,
        date: TEST_DATE,
        staffId: shop.staffB.id,
        startMinutes: OPEN,
      }),
    ).toEqual({ ok: false, message: "自分の担当分の予約のみ操作できます" });
  });

  it("別の店舗の予約は見つからない扱い", async () => {
    const r = await bookCut(OPEN);
    expectOk(r);
    expect(
      await rescheduleReservation({
        actor: owner,
        tenantId: other.tenantId,
        reservationId: r.reservationId,
        date: TEST_DATE,
        staffId: other.staffA.id,
        startMinutes: OPEN,
      }),
    ).toEqual({ ok: false, message: "予約が見つかりません" });
  });
});

describe("setReservationStatus（状態の変更）", () => {
  it("キャンセルすると日時が残り、枠が空く", async () => {
    const r = await bookCut(OPEN);
    expectOk(r);

    expect(
      await setReservationStatus({
        actor: owner,
        tenantId: shop.tenantId,
        reservationId: r.reservationId,
        status: "canceled",
      }),
    ).toEqual({ ok: true });

    const saved = await prisma.reservation.findUniqueOrThrow({ where: { id: r.reservationId } });
    expect(saved.status).toBe("canceled");
    expect(saved.canceledAt).not.toBeNull();

    expectOk(await bookCut(OPEN));
  });

  it("キャンセルを戻すとき、その間に別の予約が入っていれば戻せない", async () => {
    const r = await bookCut(OPEN);
    expectOk(r);
    await setReservationStatus({
      actor: owner,
      tenantId: shop.tenantId,
      reservationId: r.reservationId,
      status: "canceled",
    });
    expectOk(await bookCut(OPEN + 30));

    expect(
      await setReservationStatus({
        actor: owner,
        tenantId: shop.tenantId,
        reservationId: r.reservationId,
        status: "booked",
      }),
    ).toEqual({ ok: false, message: "この枠は、ちょうど今ほかの予約で埋まりました" });
  });

  it("空いていれば戻せ、キャンセル日時が消える", async () => {
    const r = await bookCut(OPEN);
    expectOk(r);
    await setReservationStatus({
      actor: owner,
      tenantId: shop.tenantId,
      reservationId: r.reservationId,
      status: "no_show",
    });
    expect(
      await setReservationStatus({
        actor: owner,
        tenantId: shop.tenantId,
        reservationId: r.reservationId,
        status: "booked",
      }),
    ).toEqual({ ok: true });

    const saved = await prisma.reservation.findUniqueOrThrow({ where: { id: r.reservationId } });
    expect(saved).toMatchObject({ status: "booked", canceledAt: null });
  });

  it("決まった状態以外は受け付けない", async () => {
    const r = await bookCut(OPEN);
    expectOk(r);
    expect(
      await setReservationStatus({
        actor: owner,
        tenantId: shop.tenantId,
        reservationId: r.reservationId,
        status: "deleted" as never,
      }),
    ).toEqual({ ok: false, message: "状態の指定が正しくありません" });
  });
});

describe("bookAsCustomer / cancelOwnReservation（お客様側）", () => {
  // 2099-01-05 の2日前（日本時間 2099-01-03 09:00）
  const NOW = new Date("2099-01-03T00:00:00Z");

  function bookAsMe(startMinutes: number, extra: Partial<Parameters<typeof bookAsCustomer>[0]> = {}) {
    return bookAsCustomer({
      tenantId: shop.tenantId,
      customerId: shop.customer.id,
      date: TEST_DATE,
      menuId: shop.cut.id,
      staffId: shop.staffA.id,
      startMinutes,
      now: NOW,
      ...extra,
    });
  }

  it("受付期間内なら取れる", async () => {
    const r = await bookAsMe(OPEN);
    expectOk(r);
    const saved = await prisma.reservation.findUniqueOrThrow({ where: { id: r.reservationId } });
    expect(saved.customerId).toBe(shop.customer.id);
  });

  it("締め切り（既定は2時間前）を過ぎた枠・受付期間より先の枠は取れない", async () => {
    // 日本時間 2099-01-05 09:00 から見た 10:00 開始
    const late = await bookAsMe(OPEN, { now: new Date("2099-01-05T00:00:00Z") });
    expect(late).toMatchObject({ ok: false });

    // 既定の受付期間は30日先まで
    const far = await bookAsMe(OPEN, { now: new Date("2098-11-01T00:00:00Z") });
    expect(far).toEqual({ ok: false, message: "予約は30日先までお受けしています" });
  });

  it("別の店舗の顧客としては取れない", async () => {
    expect(await bookAsMe(OPEN, { customerId: other.customer.id })).toEqual({
      ok: false,
      message: "お客様の情報が見つかりません",
    });
  });

  it("自分の予約だけ、締め切り前ならキャンセルできる", async () => {
    const r = await bookAsMe(OPEN);
    expectOk(r);

    const stranger = await prisma.customer.create({
      data: { tenantId: shop.tenantId, name: "別のお客様" },
    });
    expect(
      await cancelOwnReservation({
        tenantId: shop.tenantId,
        customerId: stranger.id,
        reservationId: r.reservationId,
        now: NOW,
      }),
    ).toEqual({ ok: false, message: "予約が見つかりません" });

    expect(
      await cancelOwnReservation({
        tenantId: shop.tenantId,
        customerId: shop.customer.id,
        reservationId: r.reservationId,
        now: new Date("2099-01-05T00:30:00Z"), // 日本時間 9:30。開始の30分前
      }),
    ).toEqual({ ok: false, message: "お時間が近いため、お電話でご連絡ください" });

    expect(
      await cancelOwnReservation({
        tenantId: shop.tenantId,
        customerId: shop.customer.id,
        reservationId: r.reservationId,
        now: NOW,
      }),
    ).toEqual({ ok: true });

    const saved = await prisma.reservation.findUniqueOrThrow({ where: { id: r.reservationId } });
    expect(saved.status).toBe("canceled");

    // 2回目は受け付けない
    expect(
      await cancelOwnReservation({
        tenantId: shop.tenantId,
        customerId: shop.customer.id,
        reservationId: r.reservationId,
        now: NOW,
      }),
    ).toEqual({ ok: false, message: "この予約はキャンセルできません" });
  });
});
