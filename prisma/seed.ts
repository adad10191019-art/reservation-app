/**
 * 動作確認用のダミーデータ。
 *
 * ログインに使えるアカウント（パスワードはすべて password123）
 *   就活のイロハ
 *     owner@example.com … オーナー（全員の予約を操作できる）
 *     a@example.com      … 担当者A（面談・面接練習・ES添削）
 *     b@example.com      … 担当者B（面談・面接練習）
 *     c@example.com      … 担当者C（面談・ES添削）
 *   youth商材(仮)
 *     owner-b@example.com … オーナー
 *     sa@example.com       … 担当者A
 *     sb@example.com       … 担当者B
 *     sc@example.com       … 担当者C
 *   全部署を横断できるアカウント（部署に属さない）
 *     ceo@example.com   … 社長
 *     admin@example.com … 内勤（バックアップ）
 */
import "dotenv/config";
import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";

/** "YYYY-MM-DD" を作る（今日からの日数差で指定） */
function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "10:30" → 630 */
function hm(text: string): number {
  const [h, m] = text.split(":").map(Number);
  return h * 60 + m;
}

async function main() {
  // 何度でも流せるように、毎回まっさらにする
  await prisma.changeLog.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.block.deleteMany();
  await prisma.dateOverride.deleteMany();
  await prisma.businessHour.deleteMany();
  await prisma.staffMenu.deleteMany();
  await prisma.user.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.tenant.deleteMany();

  // ── 部署（テナント） ──────────────
  const tenant = await prisma.tenant.create({
    data: { name: "就活のイロハ", slug: "shukatsu-iroha", slotMinutes: 15 },
  });

  // 他部署のデータが混ざらないことを確認するための2部署目
  const otherTenant = await prisma.tenant.create({
    data: { name: "youth商材(仮)", slug: "youth-shouzai" },
  });

  // ── 担当者（就活のイロハ） ────────
  const [staffA, staffB, staffC] = await Promise.all([
    prisma.staff.create({
      data: { tenantId: tenant.id, name: "担当者A", displayOrder: 1 },
    }),
    prisma.staff.create({
      data: { tenantId: tenant.id, name: "担当者B", displayOrder: 2 },
    }),
    prisma.staff.create({
      data: { tenantId: tenant.id, name: "担当者C", displayOrder: 3 },
    }),
  ]);

  // ── 担当者（youth商材、分離確認用）──
  const [otherStaffA, otherStaffB, otherStaffC] = await Promise.all([
    prisma.staff.create({
      data: { tenantId: otherTenant.id, name: "担当者A", displayOrder: 1 },
    }),
    prisma.staff.create({
      data: { tenantId: otherTenant.id, name: "担当者B", displayOrder: 2 },
    }),
    prisma.staff.create({
      data: { tenantId: otherTenant.id, name: "担当者C", displayOrder: 3 },
    }),
  ]);

  // ── ログインするアカウント ────────
  const passwordHash = await hashPassword("password123");

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "owner@example.com",
      passwordHash,
      role: "owner",
      staffId: null,
    },
  });

  for (const [email, staff] of [
    ["a@example.com", staffA],
    ["b@example.com", staffB],
    ["c@example.com", staffC],
  ] as const) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash,
        role: "staff",
        staffId: staff.id,
      },
    });
  }

  await prisma.user.create({
    data: {
      tenantId: otherTenant.id,
      email: "owner-b@example.com",
      passwordHash,
      role: "owner",
      staffId: null,
    },
  });

  for (const [email, staff] of [
    ["sa@example.com", otherStaffA],
    ["sb@example.com", otherStaffB],
    ["sc@example.com", otherStaffC],
  ] as const) {
    await prisma.user.create({
      data: {
        tenantId: otherTenant.id,
        email,
        passwordHash,
        role: "staff",
        staffId: staff.id,
      },
    });
  }

  // ── 全部署を横断できるアカウント（部署に属さない）──
  await prisma.user.createMany({
    data: [
      { tenantId: null, email: "ceo@example.com", passwordHash, role: "group_admin" },
      { tenantId: null, email: "admin@example.com", passwordHash, role: "group_admin" },
    ],
  });

  // ── メニュー（就活のイロハ）───────
  const interview = await prisma.menu.create({
    data: {
      tenantId: tenant.id,
      name: "面談",
      durationMinutes: 30,
      bufferMinutes: 5,
      price: 0,
    },
  });
  const mockInterview = await prisma.menu.create({
    data: {
      tenantId: tenant.id,
      name: "面接練習",
      durationMinutes: 45,
      bufferMinutes: 5,
      price: 0,
    },
  });
  const esReview = await prisma.menu.create({
    data: {
      tenantId: tenant.id,
      name: "ES添削",
      durationMinutes: 30,
      bufferMinutes: 5,
      price: 0,
    },
  });

  // ── メニュー（youth商材）──────────
  const meeting = await prisma.menu.create({
    data: {
      tenantId: otherTenant.id,
      name: "面談",
      durationMinutes: 30,
      bufferMinutes: 5,
      price: 0,
    },
  });
  const kickoff = await prisma.menu.create({
    data: {
      tenantId: otherTenant.id,
      name: "打ち合わせ",
      durationMinutes: 60,
      bufferMinutes: 10,
      price: 0,
    },
  });

  // ── 誰が何をできるか（就活のイロハ）
  // 担当者A=全部 / 担当者B=面談・面接練習 / 担当者C=面談・ES添削
  const pairs: Array<[string, string]> = [
    [staffA.id, interview.id],
    [staffA.id, mockInterview.id],
    [staffA.id, esReview.id],
    [staffB.id, interview.id],
    [staffB.id, mockInterview.id],
    [staffC.id, interview.id],
    [staffC.id, esReview.id],
  ];
  await prisma.staffMenu.createMany({
    data: pairs.map(([staffId, menuId]) => ({
      tenantId: tenant.id,
      staffId,
      menuId,
    })),
  });

  // ── 誰が何をできるか（youth商材）──
  // 3人とも面談・打ち合わせの両方に対応
  const otherPairs: Array<[string, string]> = [
    [otherStaffA.id, meeting.id],
    [otherStaffA.id, kickoff.id],
    [otherStaffB.id, meeting.id],
    [otherStaffB.id, kickoff.id],
    [otherStaffC.id, meeting.id],
    [otherStaffC.id, kickoff.id],
  ];
  await prisma.staffMenu.createMany({
    data: otherPairs.map(([staffId, menuId]) => ({
      tenantId: otherTenant.id,
      staffId,
      menuId,
    })),
  });

  // ── 営業時間（就活のイロハ。月曜定休、10:00-13:00 / 14:00-19:00）──
  const openDays = [0, 2, 3, 4, 5, 6]; // 1=月曜 は定休
  await prisma.businessHour.createMany({
    data: openDays.flatMap((dow) => [
      {
        tenantId: tenant.id,
        staffId: null,
        dayOfWeek: dow,
        startMinutes: hm("10:00"),
        endMinutes: hm("13:00"),
      },
      {
        tenantId: tenant.id,
        staffId: null,
        dayOfWeek: dow,
        startMinutes: hm("14:00"),
        endMinutes: hm("19:00"),
      },
    ]),
  });

  // 担当者Cだけ時短勤務（10:00-16:00 通し）
  await prisma.businessHour.createMany({
    data: openDays.map((dow) => ({
      tenantId: tenant.id,
      staffId: staffC.id,
      dayOfWeek: dow,
      startMinutes: hm("10:00"),
      endMinutes: hm("16:00"),
    })),
  });

  // ── 営業時間（youth商材。土日休み、09:00-18:00 通し）──
  await prisma.businessHour.createMany({
    data: [1, 2, 3, 4, 5].map((dow) => ({
      tenantId: otherTenant.id,
      staffId: null,
      dayOfWeek: dow,
      startMinutes: hm("09:00"),
      endMinutes: hm("18:00"),
    })),
  });

  // ── 日付ごとの例外（就活のイロハ）──
  // 担当者Bは3日後が終日休み
  await prisma.dateOverride.create({
    data: {
      tenantId: tenant.id,
      staffId: staffB.id,
      date: dateStr(3),
      isClosed: true,
    },
  });
  // 5日後は全体が短縮営業（10:00-15:00）
  await prisma.dateOverride.create({
    data: {
      tenantId: tenant.id,
      staffId: null,
      date: dateStr(5),
      isClosed: false,
      startMinutes: hm("10:00"),
      endMinutes: hm("15:00"),
    },
  });
  // 6日後の担当者Cは分割シフト（10:00-12:00 と 16:00-19:00）。
  // 同じ日に2行入れることで、間の時間を勤務外にできる。
  await prisma.dateOverride.createMany({
    data: [
      {
        tenantId: tenant.id,
        staffId: staffC.id,
        date: dateStr(6),
        isClosed: false,
        startMinutes: hm("10:00"),
        endMinutes: hm("12:00"),
      },
      {
        tenantId: tenant.id,
        staffId: staffC.id,
        date: dateStr(6),
        isClosed: false,
        startMinutes: hm("16:00"),
        endMinutes: hm("19:00"),
      },
    ],
  });

  // ── ブロック枠（予約以外で時間を塞ぐ）──
  // 2日後の 14:00-15:00 は就活のイロハの全担当者が会議で埋まる
  await prisma.block.create({
    data: {
      tenantId: tenant.id,
      staffId: null,
      date: dateStr(2),
      startMinutes: hm("14:00"),
      endMinutes: hm("15:00"),
      reason: "定例会議",
    },
  });

  // ── 顧客（就活のイロハ）───────────
  const [yamada, ito, kobayashi] = await Promise.all([
    prisma.customer.create({
      data: { tenantId: tenant.id, name: "山田 花子", phone: "090-1111-2222" },
    }),
    prisma.customer.create({
      data: { tenantId: tenant.id, name: "伊藤 太郎", phone: "090-3333-4444" },
    }),
    prisma.customer.create({
      data: { tenantId: tenant.id, name: "小林 美咲", phone: "090-5555-6666" },
    }),
  ]);

  // ── 予約（就活のイロハ）───────────
  // 空き枠ロジックを試せるよう、わざと一部の枠を埋めておく
  const bookings = [
    { staff: staffA, menu: interview, customer: yamada, day: 1, at: "10:00" },
    { staff: staffA, menu: mockInterview, customer: ito, day: 1, at: "14:00" },
    { staff: staffB, menu: interview, customer: kobayashi, day: 1, at: "11:00" },
    { staff: staffC, menu: esReview, customer: yamada, day: 2, at: "10:30" },
    // 14:00-15:00 は全担当者の「定例会議」ブロックと重なるため、その直後にする
    { staff: staffA, menu: esReview, customer: kobayashi, day: 2, at: "15:00" },
  ];

  for (const b of bookings) {
    const start = hm(b.at);
    await prisma.reservation.create({
      data: {
        tenantId: tenant.id,
        staffId: b.staff.id,
        customerId: b.customer.id,
        menuId: b.menu.id,
        date: dateStr(b.day),
        startMinutes: start,
        endMinutes: start + b.menu.durationMinutes + b.menu.bufferMinutes,
        menuNameSnapshot: b.menu.name,
        durationSnapshot: b.menu.durationMinutes,
        priceSnapshot: b.menu.price,
        status: "booked",
      },
    });
  }

  // キャンセル済みの予約（空き枠計算で除外されることの確認用）
  await prisma.reservation.create({
    data: {
      tenantId: tenant.id,
      staffId: staffB.id,
      customerId: ito.id,
      menuId: mockInterview.id,
      date: dateStr(1),
      startMinutes: hm("14:00"),
      endMinutes: hm("14:00") + mockInterview.durationMinutes + mockInterview.bufferMinutes,
      menuNameSnapshot: mockInterview.name,
      durationSnapshot: mockInterview.durationMinutes,
      priceSnapshot: mockInterview.price,
      status: "canceled",
      canceledAt: new Date(),
    },
  });

  // ── 顧客・予約（youth商材、分離確認用）
  const otherCustomer = await prisma.customer.create({
    data: { tenantId: otherTenant.id, name: "他部署の顧客" },
  });
  await prisma.reservation.create({
    data: {
      tenantId: otherTenant.id,
      staffId: otherStaffA.id,
      customerId: otherCustomer.id,
      menuId: meeting.id,
      date: dateStr(1),
      startMinutes: hm("09:00"),
      endMinutes: hm("09:00") + meeting.durationMinutes + meeting.bufferMinutes,
      menuNameSnapshot: meeting.name,
      durationSnapshot: meeting.durationMinutes,
      priceSnapshot: meeting.price,
      status: "booked",
    },
  });

  console.log("投入完了");
  console.log(`  部署        : ${await prisma.tenant.count()}`);
  console.log(`  担当者      : ${await prisma.staff.count()}`);
  console.log(`  メニュー    : ${await prisma.menu.count()}`);
  console.log(`  対応表      : ${await prisma.staffMenu.count()}`);
  console.log(`  営業時間    : ${await prisma.businessHour.count()}`);
  console.log(`  例外日      : ${await prisma.dateOverride.count()}`);
  console.log(`  顧客        : ${await prisma.customer.count()}`);
  console.log(`  アカウント  : ${await prisma.user.count()}`);
  console.log(`  予約        : ${await prisma.reservation.count()}`);
  console.log(`  ブロック枠  : ${await prisma.block.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
