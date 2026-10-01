/**
 * 部署をまたいだ「その人の空いていない時間」を開発用 DB で確かめる。npm run test:db で流す。
 *
 * 2つの店舗（部署）を作り、どちらの担当Aも同じ社員（兼任の人）にひも付ける。
 * 担当Bはひも付けない（今まで通りに動くことを確かめる）。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { findAvailability } from "./availability";
import { bookReservation } from "./booking";
import { fetchPersonBusy } from "./person-busy";
import type { Actor } from "./permissions";
import { prisma } from "./prisma";
import {
  OPEN,
  TEST_DATE,
  TEST_DATE_2,
  type TestShop,
  createTestEmployee,
  createTestShop,
  deleteLeftoverTestShops,
  deleteTestEmployees,
  deleteTestShop,
} from "@/test/db-fixture";

const owner: Actor = { role: "owner", staffId: null };

let shop: TestShop;
let other: TestShop;
let employeeId: string;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("person-busy");
  other = await createTestShop("person-busy（兼任先）");
  employeeId = (await createTestEmployee("兼任の人")).id;
  await prisma.staff.updateMany({
    where: { id: { in: [shop.staffA.id, other.staffA.id] } },
    data: { employeeId },
  });
});

afterEach(async () => {
  for (const tenantId of [shop.tenantId, other.tenantId]) {
    await prisma.reservation.deleteMany({ where: { tenantId } });
    await prisma.block.deleteMany({ where: { tenantId } });
  }
  await prisma.employeeEvent.deleteMany({ where: { employeeId } });
});

afterAll(async () => {
  await deleteTestEmployees();
  await deleteTestShop(shop.tenantId);
  await deleteTestShop(other.tenantId);
  await prisma.$disconnect();
});

/** 兼任先（other）で、担当A（＝同じ人）にカットを入れる */
async function bookInOtherShop(startMinutes: number) {
  const r = await bookReservation({
    actor: owner,
    tenantId: other.tenantId,
    date: TEST_DATE,
    menuId: other.cut.id,
    staffId: other.staffA.id,
    startMinutes,
    customerId: other.customer.id,
  });
  if (!r.ok) throw new Error(r.message);
  return r.reservationId;
}

/** この店舗（shop）の担当Aで、カットが入れられる開始時刻 */
async function startsOfA(): Promise<number[]> {
  const result = await findAvailability({
    tenantId: shop.tenantId,
    date: TEST_DATE,
    menuId: shop.cut.id,
    staffId: shop.staffA.id,
  });
  return result.perStaff[0]?.starts ?? [];
}

describe("兼任先の予約", () => {
  it("兼任先で入った予約の時間は、この部署の空き枠から消える", async () => {
    expect(await startsOfA()).toContain(OPEN);
    await bookInOtherShop(OPEN); // 10:00〜11:15 が塞がる
    const starts = await startsOfA();
    expect(starts).not.toContain(OPEN);
    expect(starts).not.toContain(OPEN + 60);
    expect(starts).toContain(OPEN + 75);
  });

  it("兼任先で入った予約と重なる時間には、この部署で予約を登録できない", async () => {
    await bookInOtherShop(OPEN);
    const r = await bookReservation({
      actor: owner,
      tenantId: shop.tenantId,
      date: TEST_DATE,
      menuId: shop.cut.id,
      staffId: shop.staffA.id,
      startMinutes: OPEN + 30,
      customerId: shop.customer.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("別の予定");
      // 他部署の何の予約かは伝えない
      expect(r.message).not.toContain("カット");
      expect(r.message).not.toContain(other.tenant.name);
    }
  });

  it("兼任先の予約がキャンセルされれば、また空く", async () => {
    const id = await bookInOtherShop(OPEN);
    await prisma.reservation.update({ where: { id }, data: { status: "canceled" } });
    expect(await startsOfA()).toContain(OPEN);
  });

  it("ひも付いていない担当Bには影響しない", async () => {
    await bookInOtherShop(OPEN);
    const result = await findAvailability({
      tenantId: shop.tenantId,
      date: TEST_DATE,
      menuId: shop.cut.id,
      staffId: shop.staffB.id,
    });
    expect(result.perStaff[0].starts).toContain(OPEN);
  });
});

describe("兼任先のブロック枠", () => {
  it("兼任先でその人に入れたブロック枠は、この部署でも塞ぐ", async () => {
    await prisma.block.create({
      data: {
        tenantId: other.tenantId,
        staffId: other.staffA.id,
        date: TEST_DATE,
        startMinutes: OPEN,
        endMinutes: OPEN + 60,
        reason: "兼任先の会議",
      },
    });
    expect(await startsOfA()).not.toContain(OPEN);
  });

  it("兼任先の店舗全体のブロック枠は、この部署には持ち込まない", async () => {
    await prisma.block.create({
      data: {
        tenantId: other.tenantId,
        staffId: null,
        date: TEST_DATE,
        startMinutes: OPEN,
        endMinutes: OPEN + 60,
        reason: "兼任先の清掃",
      },
    });
    expect(await startsOfA()).toContain(OPEN);
  });
});

describe("その人自身の予定（EmployeeEvent）", () => {
  it("社員の予定は、ひも付いた全部署の空き枠を塞ぐ", async () => {
    await prisma.employeeEvent.create({
      data: {
        employeeId,
        date: TEST_DATE,
        startMinutes: OPEN,
        endMinutes: OPEN + 60,
        title: "通院",
        isPrivate: true,
        createdByName: "テスト",
      },
    });
    expect(await startsOfA()).not.toContain(OPEN);

    const inOther = await findAvailability({
      tenantId: other.tenantId,
      date: TEST_DATE,
      menuId: other.cut.id,
      staffId: other.staffA.id,
    });
    expect(inOther.perStaff[0].starts).not.toContain(OPEN);
  });

  it("別の日の予定は影響しない", async () => {
    await prisma.employeeEvent.create({
      data: {
        employeeId,
        date: TEST_DATE_2,
        startMinutes: OPEN,
        endMinutes: OPEN + 60,
        title: "研修",
        createdByName: "テスト",
      },
    });
    expect(await startsOfA()).toContain(OPEN);
  });
});

describe("fetchPersonBusy が返す中身", () => {
  it("時間帯（start / end）だけを返し、件名・お客様・部署は含まない", async () => {
    await bookInOtherShop(OPEN);
    await prisma.block.create({
      data: {
        tenantId: other.tenantId,
        staffId: other.staffA.id,
        date: TEST_DATE,
        startMinutes: OPEN + 120,
        endMinutes: OPEN + 180,
        reason: "兼任先の会議",
      },
    });
    await prisma.employeeEvent.create({
      data: {
        employeeId,
        date: TEST_DATE,
        startMinutes: OPEN + 240,
        endMinutes: OPEN + 300,
        title: "通院",
        isPrivate: true,
        createdByName: "テスト",
      },
    });

    const busy = await fetchPersonBusy(prisma, { staffIds: [shop.staffA.id], dates: [TEST_DATE] });
    const list = busy.get(shop.staffA.id)?.get(TEST_DATE) ?? [];
    expect(list).toHaveLength(3);
    for (const item of list) expect(Object.keys(item).sort()).toEqual(["end", "start"]);
    expect(JSON.stringify([...busy])).not.toMatch(/会議|通院|カット|テスト顧客/);
  });

  it("自分の部署の予約・ブロック枠は含めない（呼び出し側がすでに見ているため）", async () => {
    await prisma.block.create({
      data: {
        tenantId: shop.tenantId,
        staffId: shop.staffA.id,
        date: TEST_DATE,
        startMinutes: OPEN,
        endMinutes: OPEN + 60,
        reason: "自部署の会議",
      },
    });
    const busy = await fetchPersonBusy(prisma, { staffIds: [shop.staffA.id], dates: [TEST_DATE] });
    expect(busy.get(shop.staffA.id)).toBeUndefined();
  });
});
