"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireGroupAdmin, requireOwner, startSession } from "./auth";
import { logChange } from "./change-log";
import { SLOT_CHOICES } from "./constants";
import { hashPassword } from "./password";
import { prisma } from "./prisma";
import { parseRanges } from "./ranges";
import { buildSession, type Role } from "./session";
import { formatDateLabel, toHm } from "./time";
import { validateSlug } from "./slug";

/** 設定を変えたら、予約まわりの画面も作り直させる */
function refreshAll() {
  revalidatePath("/calendar");
  revalidatePath("/booking");
  revalidatePath("/settings", "layout");
}

function back(path: string, message?: string): never {
  redirect(message ? `${path}?error=${encodeURIComponent(message)}` : `${path}?done=1`);
}

function toInt(value: FormDataEntryValue | null): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) ? n : null;
}

// ── メニュー ──────────────────────────────

export async function saveMenu(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/menus";

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const durationMinutes = toInt(formData.get("durationMinutes"));
  const bufferMinutes = toInt(formData.get("bufferMinutes"));
  const price = toInt(formData.get("price"));
  const isActive = formData.get("isActive") === "on";

  if (!name) back(path, "メニュー名を入力してください");
  if (durationMinutes === null || durationMinutes < 5 || durationMinutes > 8 * 60) {
    back(path, "所要時間は5分〜480分で入力してください");
  }
  if (bufferMinutes === null || bufferMinutes < 0 || bufferMinutes > 120) {
    back(path, "片付け時間は0分〜120分で入力してください");
  }
  if (price === null || price < 0) back(path, "料金は0以上で入力してください");

  const data = { name, durationMinutes, bufferMinutes, price, isActive };

  if (id) {
    // tenantId を where に入れたまま更新する。
    // 「存在を確かめてから id で更新」だと、条件の書き忘れに気づけないうえ、
    // 確認と更新の間に別のものへすり替わる余地も残る。
    const updated = await prisma.menu.updateMany({
      where: { id, tenantId: session.tenantId },
      data,
    });
    if (updated.count === 0) back(path, "メニューが見つかりません");
  } else {
    await prisma.menu.create({ data: { ...data, tenantId: session.tenantId } });
  }

  refreshAll();
  back(path);
}

/**
 * メニューを削除する。
 *
 * 予約は menuNameSnapshot などに値を複製して持つので、本来は
 * メニュー本体が消えても過去の表示は崩れない。ただし「間違って消した」
 * ときの取り返しがつかないぶん危険なので、1件でも予約が紐づいて
 * いれば（過去も含めて）削除させず、設定 → メニュー の「受付中」の
 * チェックを外す方法に誘導する。
 */
export async function deleteMenu(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/menus";

  const id = String(formData.get("id") ?? "");
  if (!id) back(path, "メニューが指定されていません");

  // tenantId を必ず条件に入れる
  const menu = await prisma.menu.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!menu) back(path, "メニューが見つかりません");

  const used = await prisma.reservation.count({
    where: { menuId: id, tenantId: session.tenantId },
  });
  if (used > 0) {
    back(
      path,
      `「${menu.name}」は${used}件の予約で使われているため削除できません。「受付中」のチェックを外してください`,
    );
  }

  // StaffMenu（対応表）は Menu の削除に連動して自動で消える
  await prisma.menu.delete({ where: { id } });

  refreshAll();
  back(path);
}

// ── スタッフ ──────────────────────────────

export async function saveStaff(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/staff";

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const displayOrder = toInt(formData.get("displayOrder")) ?? 0;
  const isActive = formData.get("isActive") === "on";
  const menuIds = formData.getAll("menuIds").map(String).filter(Boolean);

  if (!name) back(path, "スタッフ名を入力してください");

  // 指定されたメニューが自店舗のものか確かめる
  const menus = await prisma.menu.findMany({
    where: { id: { in: menuIds }, tenantId: session.tenantId },
    select: { id: true },
  });
  if (menus.length !== menuIds.length) back(path, "メニューの指定が正しくありません");

  let staffId = id;

  if (id) {
    const updated = await prisma.staff.updateMany({
      where: { id, tenantId: session.tenantId },
      data: { name, displayOrder, isActive },
    });
    if (updated.count === 0) back(path, "スタッフが見つかりません");
  } else {
    const created = await prisma.staff.create({
      data: { name, displayOrder, isActive, tenantId: session.tenantId },
    });
    staffId = created.id;
  }

  // 対応メニューは毎回入れ替える
  await prisma.staffMenu.deleteMany({ where: { staffId, tenantId: session.tenantId } });
  if (menuIds.length > 0) {
    await prisma.staffMenu.createMany({
      data: menuIds.map((menuId) => ({ tenantId: session.tenantId, staffId, menuId })),
    });
  }

  refreshAll();
  back(path);
}

// ── 営業時間（曜日ごとの基本パターン） ────

export async function saveBusinessHours(formData: FormData) {
  const session = await requireOwner();

  // "shop" なら店舗全体、それ以外はスタッフID
  const target = String(formData.get("target") ?? "shop");
  const staffId = target === "shop" ? null : target;
  const path = `/settings/hours?target=${encodeURIComponent(target)}`;

  const fail: (message: string) => never = (message) =>
    redirect(`${path}&error=${encodeURIComponent(message)}`);

  if (staffId) {
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, tenantId: session.tenantId },
    });
    if (!staff) fail("スタッフが見つかりません");
  }

  // 7日分をまとめて読み、1日でも形式が違えば何も保存しない
  const parsed: { dayOfWeek: number; start: number; end: number }[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const text = String(formData.get(`day${dayOfWeek}`) ?? "");
    const result = parseRanges(text);
    if (!result.ok) {
      const labels = ["日", "月", "火", "水", "木", "金", "土"];
      fail(`${labels[dayOfWeek]}曜: ${result.message}`);
    } else {
      for (const interval of result.intervals) {
        parsed.push({ dayOfWeek, start: interval.start, end: interval.end });
      }
    }
  }

  // 入れ替えは1つの取引にまとめる。途中で失敗しても中途半端に残らない
  await prisma.$transaction(async (tx) => {
    await tx.businessHour.deleteMany({ where: { tenantId: session.tenantId, staffId } });
    if (parsed.length > 0) {
      await tx.businessHour.createMany({
        data: parsed.map((p) => ({
          tenantId: session.tenantId,
          staffId,
          dayOfWeek: p.dayOfWeek,
          startMinutes: p.start,
          endMinutes: p.end,
        })),
      });
    }
  });

  refreshAll();
  redirect(`${path}&done=1`);
}

// ── アカウント ────────────────────────────

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createAccount(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/accounts";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const staffId = String(formData.get("staffId") ?? "");

  if (!EMAIL_PATTERN.test(email)) back(path, "メールアドレスの形式が正しくありません");
  if (password.length < 8) back(path, "パスワードは8文字以上にしてください");
  if (role !== "owner" && role !== "staff") back(path, "権限の指定が正しくありません");
  if (role === "staff" && !staffId) {
    back(path, "スタッフ権限のアカウントは、担当するスタッフを選んでください");
  }

  const existing = await prisma.user.findFirst({
    where: { tenantId: session.tenantId, email },
  });
  if (existing) back(path, "このメールアドレスはすでに使われています");

  if (staffId) {
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, tenantId: session.tenantId },
    });
    if (!staff) back(path, "スタッフが見つかりません");

    // User.staffId は一意。すでに紐づくアカウントがあれば弾く
    const taken = await prisma.user.findFirst({ where: { staffId } });
    if (taken) back(path, "このスタッフには、すでにアカウントがあります");
  }

  await prisma.user.create({
    data: {
      tenantId: session.tenantId,
      email,
      passwordHash: await hashPassword(password),
      role,
      // オーナーでもスタッフに紐づけてよい。
      // 「普段はスタッフだが、代理でオーナー権限を持つ」場合に必要。
      staffId: staffId || null,
    },
  });

  refreshAll();
  back(path);
}

export async function deleteAccount(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/accounts";

  const id = String(formData.get("id") ?? "");

  if (id === session.userId) back(path, "自分自身のアカウントは削除できません");

  const target = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!target) back(path, "アカウントが見つかりません");

  // オーナーが誰もいなくなると、設定を変えられなくなる
  if (target.role === "owner") {
    const owners = await prisma.user.count({
      where: { tenantId: session.tenantId, role: "owner" },
    });
    if (owners <= 1) back(path, "オーナーのアカウントは最低1つ必要です");
  }

  await prisma.user.deleteMany({ where: { id, tenantId: session.tenantId } });

  refreshAll();
  back(path);
}

export async function resetAccountPassword(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/accounts";

  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) back(path, "パスワードは8文字以上にしてください");

  const updated = await prisma.user.updateMany({
    where: { id, tenantId: session.tenantId },
    data: { passwordHash: await hashPassword(password) },
  });
  if (updated.count === 0) back(path, "アカウントが見つかりません");

  refreshAll();
  back(path);
}

// ── 店舗の基本設定 ────────────────────────

export async function saveStore(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/store";

  const name = String(formData.get("name") ?? "").trim();
  const slotMinutes = toInt(formData.get("slotMinutes"));
  const slugInput = String(formData.get("slug") ?? "").trim();

  if (!name) back(path, "店舗名を入力してください");
  if (slotMinutes === null || !SLOT_CHOICES.includes(slotMinutes as never)) {
    back(path, "予約枠の刻みの指定が正しくありません");
  }

  // 空欄なら未設定に戻す（お客様向けURLは店舗IDのものになる）
  let slug: string | null = null;
  if (slugInput !== "") {
    const checked = validateSlug(slugInput);
    if (!checked.ok) back(path, checked.message);
    slug = checked.slug;

    // 他の店舗が使っていないか。店舗をまたいで一意である必要がある
    const taken = await prisma.tenant.findFirst({
      where: { slug, NOT: { id: session.tenantId } },
      select: { id: true },
    });
    if (taken) back(path, "その短い名前は、ほかの店舗が使っています");
  }

  await prisma.tenant.update({
    where: { id: session.tenantId },
    data: { name, slotMinutes, slug },
  });

  refreshAll();
  back(path);
}

// ── LINE連携（店舗ごと） ──────────────────

/**
 * この店舗専用のLINE連携情報を保存する。
 *
 * 空欄にすると未設定に戻る。未設定の間は、環境変数
 * （システム全体の既定値）が使われる。
 * 複数の公式LINEアカウントを店舗ごとに使い分けたいときに、ここへ入れる。
 */
export async function saveLineSettings(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/store";

  const channelId = String(formData.get("lineLoginChannelId") ?? "").trim() || null;
  const channelSecret = String(formData.get("lineLoginChannelSecret") ?? "").trim() || null;
  const messagingToken =
    String(formData.get("lineMessagingAccessToken") ?? "").trim() || null;

  // 片方だけ入れると、戻ってきたときに認証できず気づきにくい事故になる
  if ((channelId === null) !== (channelSecret === null)) {
    back(path, "LINEログインは、チャネルIDとチャネルシークレットを両方入れてください");
  }

  await prisma.tenant.update({
    where: { id: session.tenantId },
    data: {
      lineLoginChannelId: channelId,
      lineLoginChannelSecret: channelSecret,
      lineMessagingAccessToken: messagingToken,
    },
  });

  refreshAll();
  back(path);
}

// ── 権限の切り替え ────────────────────────

export async function changeAccountRole(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/accounts";

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  if (role !== "owner" && role !== "staff") back(path, "権限の指定が正しくありません");

  const target = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!target) back(path, "アカウントが見つかりません");
  if (target.role === role) back(path, "すでにその権限です");

  // スタッフに下げるなら、担当スタッフに紐づいている必要がある
  if (role === "staff" && !target.staffId) {
    back(path, "担当スタッフに紐づいていないアカウントは、スタッフ権限にできません");
  }

  // オーナーが誰もいなくなると、設定を変えられなくなる
  if (target.role === "owner" && role === "staff") {
    const owners = await prisma.user.count({
      where: { tenantId: session.tenantId, role: "owner" },
    });
    if (owners <= 1) back(path, "オーナーのアカウントは最低1つ必要です");
  }

  await prisma.user.updateMany({
    where: { id, tenantId: session.tenantId },
    data: { role },
  });

  refreshAll();
  back(path);
}

// ── 日付ごとの例外とブロック枠 ────────────

function daysPath(date: string): string {
  return `/settings/days?date=${encodeURIComponent(date)}`;
}

/**
 * その日の勤務時間を、店舗全体とスタッフそれぞれについて保存する。
 *
 * 入力欄が空で「休み」にもチェックがなければ、例外を消して
 * 曜日ごとの基本パターンに戻す。
 */
export async function saveDateOverrides(formData: FormData) {
  const session = await requireOwner();
  const date = String(formData.get("date") ?? "");
  const path = daysPath(date);

  const fail: (message: string) => never = (message) =>
    redirect(`${path}&error=${encodeURIComponent(message)}`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("日付の形式が正しくありません");

  const staffs = await prisma.staff.findMany({
    where: { tenantId: session.tenantId, isActive: true },
    select: { id: true, name: true },
  });

  // 対象は「店舗全体」と各スタッフ
  const targets: { staffId: string | null; label: string }[] = [
    { staffId: null, label: "店舗全体" },
    ...staffs.map((s) => ({ staffId: s.id, label: s.name })),
  ];

  type Row = {
    staffId: string | null;
    isClosed: boolean;
    startMinutes: number | null;
    endMinutes: number | null;
  };
  const rows: Row[] = [];

  // 1つでも形式が違えば、何も保存しない
  for (const target of targets) {
    const key = target.staffId ?? "shop";
    const isClosed = formData.get(`closed_${key}`) === "on";
    const text = String(formData.get(`ranges_${key}`) ?? "");

    if (isClosed) {
      rows.push({ staffId: target.staffId, isClosed: true, startMinutes: null, endMinutes: null });
      continue;
    }

    const result = parseRanges(text);
    if (!result.ok) fail(`${target.label}: ${result.message}`);
    else {
      for (const interval of result.intervals) {
        rows.push({
          staffId: target.staffId,
          isClosed: false,
          startMinutes: interval.start,
          endMinutes: interval.end,
        });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.dateOverride.deleteMany({ where: { tenantId: session.tenantId, date } });
    if (rows.length > 0) {
      await tx.dateOverride.createMany({
        data: rows.map((r) => ({ ...r, tenantId: session.tenantId, date })),
      });
    }
  });

  await logChange({
    tenantId: session.tenantId,
    actorName: session.name,
    entity: "dateOverride",
    action: "created",
    summary: `${formatDateLabel(date)} の日付ごとの勤務時間を変更（店舗全体・全スタッフぶん）`,
  });

  refreshAll();
  redirect(`${path}&done=1`);
}

export async function createBlock(formData: FormData) {
  const session = await requireOwner();
  const date = String(formData.get("date") ?? "");
  const path = daysPath(date);

  const fail: (message: string) => never = (message) =>
    redirect(`${path}&error=${encodeURIComponent(message)}`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("日付の形式が正しくありません");

  const staffId = String(formData.get("staffId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const startText = String(formData.get("start") ?? "");
  const endText = String(formData.get("end") ?? "");

  if (!reason) fail("理由を入力してください");

  const result = parseRanges(`${startText}-${endText}`);
  if (!result.ok) fail(result.message);
  if (result.intervals.length !== 1) fail("時間の指定が正しくありません");

  const interval = result.intervals[0];

  let staffName = "全スタッフ";
  if (staffId) {
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, tenantId: session.tenantId },
    });
    if (!staff) fail("スタッフが見つかりません");
    staffName = staff.name;
  }

  // すでに入っている予約と重なる場合は知らせる（登録自体は認める）
  const overlapping = await prisma.reservation.count({
    where: {
      tenantId: session.tenantId,
      date,
      status: "booked",
      ...(staffId ? { staffId } : {}),
      startMinutes: { lt: interval.end },
      endMinutes: { gt: interval.start },
    },
  });

  await prisma.block.create({
    data: {
      tenantId: session.tenantId,
      staffId: staffId || null,
      date,
      startMinutes: interval.start,
      endMinutes: interval.end,
      reason,
    },
  });

  await logChange({
    tenantId: session.tenantId,
    actorName: session.name,
    entity: "block",
    action: "created",
    summary: `${formatDateLabel(date)} ${toHm(interval.start)}-${toHm(interval.end)} ${reason}（${staffName}）を追加`,
  });

  refreshAll();
  if (overlapping > 0) {
    redirect(
      `${path}&error=${encodeURIComponent(
        `登録しましたが、この時間にはすでに予約が${overlapping}件あります。カレンダーで確認してください`,
      )}`,
    );
  }
  redirect(`${path}&done=1`);
}

export async function deleteBlock(formData: FormData) {
  const session = await requireOwner();
  const date = String(formData.get("date") ?? "");
  const id = String(formData.get("id") ?? "");
  const path = daysPath(date);

  // 消える前に内容を控えておく（削除後では履歴に残せないため）
  const block = await prisma.block.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { staff: true },
  });
  if (!block) {
    redirect(path + "&error=" + encodeURIComponent("見つかりません"));
  }

  const deleted = await prisma.block.deleteMany({
    where: { id, tenantId: session.tenantId },
  });
  if (deleted.count === 0) {
    redirect(path + "&error=" + encodeURIComponent("見つかりません"));
  }

  await logChange({
    tenantId: session.tenantId,
    actorName: session.name,
    entity: "block",
    action: "deleted",
    summary: `${formatDateLabel(block.date)} ${toHm(block.startMinutes)}-${toHm(block.endMinutes)} ${block.reason}（${block.staff?.name ?? "全スタッフ"}）を削除`,
  });

  refreshAll();
  redirect(`${path}&done=1`);
}

// ── 部署（テナント）。全社を横断できる group_admin だけが行える ──

/** 新しい部署を作り、作ったその場でそこへ切り替える */
export async function createTenant(formData: FormData) {
  const session = await requireGroupAdmin();
  const path = "/settings/tenants";

  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();

  if (!name) back(path, "部署名を入力してください");

  let slug: string | null = null;
  if (slugInput !== "") {
    const checked = validateSlug(slugInput);
    if (!checked.ok) back(path, checked.message);
    slug = checked.slug;

    const taken = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
    if (taken) back(path, "その短い名前は、ほかの部署が使っています");
  }

  const tenant = await prisma.tenant.create({ data: { name, slug } });

  // 作ったその場で、その部署の設定を続けられるようにする
  await startSession(
    buildSession({
      userId: session.userId,
      tenantId: tenant.id,
      role: "group_admin",
      staffId: null,
      name: session.name,
    }),
  );

  revalidatePath("/settings", "layout");
  redirect("/settings/store?done=1");
}

/** 既存の部署の名前・短い名前（URL）を変更する */
export async function updateTenant(formData: FormData) {
  await requireGroupAdmin();
  const path = "/settings/tenants";

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();

  if (!name) back(path, "部署名を入力してください");

  const target = await prisma.tenant.findUnique({ where: { id } });
  if (!target) back(path, "部署が見つかりません");

  let slug: string | null = null;
  if (slugInput !== "") {
    const checked = validateSlug(slugInput);
    if (!checked.ok) back(path, checked.message);
    slug = checked.slug;

    const taken = await prisma.tenant.findFirst({
      where: { slug, NOT: { id } },
      select: { id: true },
    });
    if (taken) back(path, "その短い名前は、ほかの部署が使っています");
  }

  await prisma.tenant.update({ where: { id }, data: { name, slug } });

  revalidatePath("/settings", "layout");
  back(path);
}
