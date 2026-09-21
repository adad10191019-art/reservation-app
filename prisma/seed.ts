/**
 * 動作確認用のダミーデータ。
 *
 * ログインに使えるアカウント（パスワードはすべて password123）
 *   owner@example.com   … オーナー（全員の予約を操作できる）
 *   sato@example.com    … スタッフ 佐藤（自分の担当分のみ）
 *   suzuki@example.com  … スタッフ 鈴木
 *   tanaka@example.com  … スタッフ 田中
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

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

  // ── 店舗 ──────────────────────────
  const tenant = await prisma.tenant.create({
    data: { name: "サンプルヘアサロン", slotMinutes: 15 },
  });

  // 他店舗のデータが混ざらないことを確認するための2店舗目
  const otherTenant = await prisma.tenant.create({
    data: { name: "別店舗（分離確認用）" },
  });

  // ── スタッフ ──────────────────────
  const [sato, suzuki, tanaka] = await Promise.all([
    prisma.staff.create({
      data: { tenantId: tenant.id, name: "佐藤", displayOrder: 1 },
    }),
    prisma.staff.create({
      data: { tenantId: tenant.id, name: "鈴木", displayOrder: 2 },
    }),
    prisma.staff.create({
      data: { tenantId: tenant.id, name: "田中", displayOrder: 3 },
    }),
  ]);

  await prisma.staff.create({
    data: { tenantId: otherTenant.id, name: "他店スタッフ" },
  });

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
    ["sato@example.com", sato],
    ["suzuki@example.com", suzuki],
    ["tanaka@example.com", tanaka],
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

  // ── メニュー ──────────────────────
  const cut = await prisma.menu.create({
    data: {
      tenantId: tenant.id,
      name: "カット",
      durationMinutes: 60,
      bufferMinutes: 10,
      price: 4400,
    },
  });
  const color = await prisma.menu.create({
    data: {
      tenantId: tenant.id,
      name: "カラー",
      durationMinutes: 90,
      bufferMinutes: 10,
      price: 8800,
    },
  });
  const perm = await prisma.menu.create({
    data: {
      tenantId: tenant.id,
      name: "パーマ",
      durationMinutes: 120,
      bufferMinutes: 15,
      price: 12000,
    },
  });
  const spa = await prisma.menu.create({
    data: {
      tenantId: tenant.id,
      name: "ヘッドスパ",
      durationMinutes: 30,
      bufferMinutes: 5,
      price: 3300,
    },
  });

  // ── 誰が何をできるか ──────────────
  // 佐藤=全部 / 鈴木=カット・カラー / 田中=カット・ヘッドスパ
  const pairs: Array<[string, string]> = [
    [sato.id, cut.id],
    [sato.id, color.id],
    [sato.id, perm.id],
    [sato.id, spa.id],
    [suzuki.id, cut.id],
    [suzuki.id, color.id],
    [tanaka.id, cut.id],
    [tanaka.id, spa.id],
  ];
  await prisma.staffMenu.createMany({
    data: pairs.map(([staffId, menuId]) => ({
      tenantId: tenant.id,
      staffId,
      menuId,
    })),
  });

  // ── 営業時間（月曜定休、10:00-13:00 / 14:00-19:00）──
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

  // 田中だけ時短勤務（10:00-16:00 通し）
  await prisma.businessHour.createMany({
    data: openDays.map((dow) => ({
      tenantId: tenant.id,
      staffId: tanaka.id,
      dayOfWeek: dow,
      startMinutes: hm("10:00"),
      endMinutes: hm("16:00"),
    })),
  });

  // ── 日付ごとの例外 ────────────────
  // 鈴木は3日後が終日休み
  await prisma.dateOverride.create({
    data: {
      tenantId: tenant.id,
      staffId: suzuki.id,
      date: dateStr(3),
      isClosed: true,
    },
  });
  // 5日後は店舗全体が短縮営業（10:00-15:00）
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
  // 6日後の田中は分割シフト（10:00-12:00 と 16:00-19:00）。
  // 同じ日に2行入れることで、間の時間を勤務外にできる。
  await prisma.dateOverride.createMany({
    data: [
      {
        tenantId: tenant.id,
        staffId: tanaka.id,
        date: dateStr(6),
        isClosed: false,
        startMinutes: hm("10:00"),
        endMinutes: hm("12:00"),
      },
      {
        tenantId: tenant.id,
        staffId: tanaka.id,
        date: dateStr(6),
        isClosed: false,
        startMinutes: hm("16:00"),
        endMinutes: hm("19:00"),
      },
    ],
  });

  // ── ブロック枠（予約以外で時間を塞ぐ）──
  // 2日後の 14:00-15:00 は全スタッフが会議で埋まる
  await prisma.block.create({
    data: {
      tenantId: tenant.id,
      staffId: null,
      date: dateStr(2),
      startMinutes: hm("14:00"),
      endMinutes: hm("15:00"),
      reason: "スタッフ会議",
    },
  });

  // ── 顧客 ──────────────────────────
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

  // ── 予約 ──────────────────────────
  // 空き枠ロジックを試せるよう、わざと一部の枠を埋めておく
  const bookings = [
    { staff: sato, menu: cut, customer: yamada, day: 1, at: "10:00" },
    { staff: sato, menu: color, customer: ito, day: 1, at: "14:00" },
    { staff: suzuki, menu: cut, customer: kobayashi, day: 1, at: "11:00" },
    { staff: tanaka, menu: spa, customer: yamada, day: 2, at: "10:30" },
    { staff: sato, menu: perm, customer: kobayashi, day: 2, at: "14:00" },
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
      staffId: suzuki.id,
      customerId: ito.id,
      menuId: color.id,
      date: dateStr(1),
      startMinutes: hm("14:00"),
      endMinutes: hm("14:00") + color.durationMinutes + color.bufferMinutes,
      menuNameSnapshot: color.name,
      durationSnapshot: color.durationMinutes,
      priceSnapshot: color.price,
      status: "canceled",
      canceledAt: new Date(),
    },
  });

  console.log("投入完了");
  console.log(`  店舗        : ${await prisma.tenant.count()}`);
  console.log(`  スタッフ    : ${await prisma.staff.count()}`);
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
