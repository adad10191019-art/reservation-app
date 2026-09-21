"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "./auth";
import { hashPassword } from "./password";
import { prisma } from "./prisma";
import { parseRanges } from "./ranges";
import type { Role } from "./session";

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
    // tenantId を必ず条件に入れる（他店舗のデータを書き換えないため）
    const existing = await prisma.menu.findFirst({
      where: { id, tenantId: session.tenantId },
    });
    if (!existing) back(path, "メニューが見つかりません");
    await prisma.menu.update({ where: { id }, data });
  } else {
    await prisma.menu.create({ data: { ...data, tenantId: session.tenantId } });
  }

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
    const existing = await prisma.staff.findFirst({
      where: { id, tenantId: session.tenantId },
    });
    if (!existing) back(path, "スタッフが見つかりません");
    await prisma.staff.update({ where: { id }, data: { name, displayOrder, isActive } });
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

  const fail = (message: string): never =>
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
      staffId: role === "staff" ? staffId : null,
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

  await prisma.user.delete({ where: { id } });

  refreshAll();
  back(path);
}

export async function resetAccountPassword(formData: FormData) {
  const session = await requireOwner();
  const path = "/settings/accounts";

  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) back(path, "パスワードは8文字以上にしてください");

  const target = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!target) back(path, "アカウントが見つかりません");

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });

  refreshAll();
  back(path);
}
