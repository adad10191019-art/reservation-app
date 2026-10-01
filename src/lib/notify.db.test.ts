/**
 * notify.ts の前日リマインド（sendRemindersFor）を開発用 DB で確かめる。
 *
 * LINE・メールへは本当に送らないよう pushTextMessage と sendNotificationEmail を差し替え、
 * 「誰に何回送ろうとしたか」と、DB の送信済みの印を確かめる。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sendNotificationEmail } from "./email";
import { pushTextMessage } from "./line-messaging";
import { notifyReservationCreated, sendRemindersFor } from "./notify";
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

vi.mock("./line-messaging", () => ({ pushTextMessage: vi.fn() }));
const push = vi.mocked(pushTextMessage);
vi.mock("./email", () => ({ sendNotificationEmail: vi.fn() }));
const mail = vi.mocked(sendNotificationEmail);

let shop: TestShop;

beforeAll(async () => {
  await deleteLeftoverTestShops();
  shop = await createTestShop("notify");
});

beforeEach(() => {
  push.mockReset();
  push.mockResolvedValue({ ok: true, sent: true });
  mail.mockReset();
  mail.mockResolvedValue({ ok: true, sent: true });
});

afterEach(async () => {
  await prisma.reservation.deleteMany({ where: { tenantId: shop.tenantId } });
  await prisma.customer.deleteMany({
    where: { tenantId: shop.tenantId, id: { not: shop.customer.id } },
  });
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await prisma.$disconnect();
});

let seq = 0;

/**
 * 予約を1件入れる。lineUserId を渡すと LINE 連携済み、email を渡すと
 * メールでログインしたお客様にする（どちらも無ければ連絡先の無いお客様）
 */
async function insert(opts: {
  lineUserId?: string | null;
  email?: string;
  date?: string;
  startMinutes?: number;
  status?: string;
  reminderSentAt?: Date | null;
}) {
  const customer =
    !opts.lineUserId && !opts.email
      ? shop.customer
      : await prisma.customer.create({
          data: {
            tenantId: shop.tenantId,
            name: `お客さん${++seq}`,
            lineUserId: opts.lineUserId ?? null,
            email: opts.email ?? null,
          },
        });
  const start = opts.startMinutes ?? OPEN;
  return prisma.reservation.create({
    data: {
      tenantId: shop.tenantId,
      staffId: shop.staffA.id,
      customerId: customer.id,
      menuId: shop.cut.id,
      date: opts.date ?? TEST_DATE,
      startMinutes: start,
      endMinutes: start + 75,
      menuNameSnapshot: "カット",
      durationSnapshot: 60,
      priceSnapshot: 4000,
      status: opts.status ?? "booked",
      reminderSentAt: opts.reminderSentAt ?? null,
    },
  });
}

function reminderSentAt(id: string) {
  return prisma.reservation
    .findUniqueOrThrow({ where: { id } })
    .then((r) => r.reminderSentAt);
}

describe("sendRemindersFor", () => {
  it("その日の予約済み・LINE連携済みの人にだけ、開始の早い順に送って印を付ける", async () => {
    const later = await insert({ lineUserId: "U-later", startMinutes: OPEN + 120 });
    const first = await insert({ lineUserId: "U-first", startMinutes: OPEN });
    const noLine = await insert({ lineUserId: null, startMinutes: OPEN + 240 });
    const canceled = await insert({ lineUserId: "U-canceled", status: "canceled", startMinutes: OPEN + 300 });
    const otherDay = await insert({ lineUserId: "U-other-day", date: TEST_DATE_2 });

    const outcomes = await sendRemindersFor(TEST_DATE);

    expect(outcomes.map((o) => o.reservationId)).toEqual([first.id, later.id]);
    expect(outcomes.every((o) => o.sent)).toBe(true);
    expect(push.mock.calls.map(([p]) => p.to)).toEqual(["U-first", "U-later"]);
    expect(push.mock.calls[0][0].text).toContain("カット");

    expect(await reminderSentAt(first.id)).not.toBeNull();
    expect(await reminderSentAt(later.id)).not.toBeNull();
    for (const r of [noLine, canceled, otherDay]) {
      expect(await reminderSentAt(r.id)).toBeNull();
    }
  });

  it("送信済みの予約には2回目を送らない", async () => {
    await insert({ lineUserId: "U-1" });
    await sendRemindersFor(TEST_DATE);
    expect(push).toHaveBeenCalledTimes(1);

    const again = await sendRemindersFor(TEST_DATE);
    expect(again).toEqual([]);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("前もって送信済みの印がある予約は飛ばす", async () => {
    await insert({ lineUserId: "U-1", reminderSentAt: new Date() });
    expect(await sendRemindersFor(TEST_DATE)).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });

  it("送れなかった予約は印を外し、次の実行でもう一度送る", async () => {
    const r = await insert({ lineUserId: "U-1" });

    push.mockResolvedValueOnce({ ok: false, reason: "LINEが受け付けませんでした（500）" });
    const failed = await sendRemindersFor(TEST_DATE);
    expect(failed).toEqual([
      expect.objectContaining({ reservationId: r.id, sent: false, reason: "LINEが受け付けませんでした（500）" }),
    ]);
    expect(await reminderSentAt(r.id)).toBeNull();

    const retried = await sendRemindersFor(TEST_DATE);
    expect(retried).toEqual([expect.objectContaining({ reservationId: r.id, sent: true })]);
    expect(await reminderSentAt(r.id)).not.toBeNull();
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("送信アクセストークン未設定（sent: false）のときも印を外す", async () => {
    const r = await insert({ lineUserId: "U-1" });
    push.mockResolvedValueOnce({ ok: true, sent: false, reason: "LINEの送信アクセストークンが未設定です" });

    const outcomes = await sendRemindersFor(TEST_DATE);
    expect(outcomes[0]).toMatchObject({ sent: false });
    expect(await reminderSentAt(r.id)).toBeNull();
  });

  it("同じ回が同時に2回呼ばれても、1人に送るのは1回だけ", async () => {
    await insert({ lineUserId: "U-1", startMinutes: OPEN });
    await insert({ lineUserId: "U-2", startMinutes: OPEN + 120 });
    await insert({ lineUserId: "U-3", startMinutes: OPEN + 240 });

    // 送信に少し時間がかかる状況にして、2つの実行を重ねる
    push.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, sent: true }), 50)),
    );

    const [a, b] = await Promise.all([sendRemindersFor(TEST_DATE), sendRemindersFor(TEST_DATE)]);

    const sentTo = push.mock.calls.map(([p]) => p.to).sort();
    expect(sentTo).toEqual(["U-1", "U-2", "U-3"]);
    expect(a.length + b.length).toBe(3);
  });
});

describe("メールのお客様への通知", () => {
  it("LINEが無くメールアドレスがある人には、店舗名を差出人名にしてメールで送る", async () => {
    const r = await insert({ email: "hanako@example.com" });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: shop.tenantId } });

    const outcomes = await sendRemindersFor(TEST_DATE);

    expect(outcomes).toEqual([expect.objectContaining({ reservationId: r.id, sent: true })]);
    expect(push).not.toHaveBeenCalled();
    expect(mail).toHaveBeenCalledTimes(1);
    const sent = mail.mock.calls[0][0];
    expect(sent.to).toBe("hanako@example.com");
    expect(sent.fromName).toBe(tenant.name);
    expect(sent.subject).toContain("明日のご予約");
    expect(sent.text).toContain("カット");
    expect(sent.text).toContain("このメールは送信専用です");
    expect(await reminderSentAt(r.id)).not.toBeNull();
  });

  it("LINEとメールの両方がある人には、LINEだけに送る", async () => {
    await insert({ lineUserId: "U-both", email: "both@example.com" });

    await sendRemindersFor(TEST_DATE);

    expect(push.mock.calls.map(([p]) => p.to)).toEqual(["U-both"]);
    expect(mail).not.toHaveBeenCalled();
  });

  it("メールが送れなかった予約も印を外し、次の実行でもう一度送る", async () => {
    const r = await insert({ email: "hanako@example.com" });
    mail.mockResolvedValueOnce({ ok: false, reason: "送信に失敗しました" });

    expect((await sendRemindersFor(TEST_DATE))[0]).toMatchObject({ sent: false });
    expect(await reminderSentAt(r.id)).toBeNull();

    expect((await sendRemindersFor(TEST_DATE))[0]).toMatchObject({ sent: true });
    expect(mail).toHaveBeenCalledTimes(2);
  });

  it("予約完了の知らせもメールで届く", async () => {
    const r = await insert({ email: "hanako@example.com" });

    const result = await notifyReservationCreated(r.id);

    expect(result).toEqual({ ok: true, sent: true });
    expect(mail.mock.calls[0][0].subject).toContain("ご予約を承りました");
  });

  it("LINEもメールも無いお客様には送らない", async () => {
    const r = await insert({});

    const result = await notifyReservationCreated(r.id);

    expect(result).toMatchObject({ ok: true, sent: false });
    expect(push).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });
});
