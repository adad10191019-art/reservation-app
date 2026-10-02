/**
 * 設定→メンバー の一覧と1人の画面に出す中身を読む。
 * 全社管理者は全員、オーナーは今の部署のメンバー（と、前にいた人）だけ。
 */
import type { Actor } from "./member-access";
import { prisma } from "./prisma";

const USER_FIELDS = {
  select: {
    id: true,
    email: true,
    isGroupAdmin: true,
    mustChangePassword: true,
    memberships: { select: { tenantId: true, role: true, staffId: true, lineUserId: true } },
  },
} as const;

export type MemberDept = { tenantId: string; tenantName: string; role: string | null };

export type MemberRow = {
  employeeId: string;
  name: string;
  email: string | null;
  isGroupAdmin: boolean;
  mustChangePassword: boolean;
  isActive: boolean;
  depts: MemberDept[];
};

export async function loadTenants() {
  return prisma.tenant.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
}

/** 名簿の人を、ログインと部署ごとの担当をまとめた1行にする */
function toRow(
  e: {
    id: string;
    name: string;
    isActive: boolean;
    user: {
      email: string;
      isGroupAdmin: boolean;
      mustChangePassword: boolean;
      memberships: { tenantId: string; role: string }[];
    } | null;
    staffs: {
      tenantId: string;
      isActive: boolean;
      membership: { user: { email: string; isGroupAdmin: boolean; mustChangePassword: boolean; memberships: { tenantId: string; role: string }[] } } | null;
    }[];
  },
  tenantNames: Map<string, string>,
): MemberRow {
  const user = e.user ?? e.staffs.find((s) => s.membership)?.membership?.user ?? null;
  const tenantIds = [
    ...new Set([
      ...e.staffs.filter((s) => s.isActive).map((s) => s.tenantId),
      ...(user?.memberships.map((m) => m.tenantId) ?? []),
    ]),
  ];
  // 部署は作った順にそろえる
  const order = [...tenantNames.keys()];
  tenantIds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return {
    employeeId: e.id,
    name: e.name,
    email: user?.email ?? null,
    isGroupAdmin: user?.isGroupAdmin ?? false,
    mustChangePassword: user?.mustChangePassword ?? false,
    isActive: e.isActive,
    depts: tenantIds.map((tenantId) => ({
      tenantId,
      tenantName: tenantNames.get(tenantId) ?? "",
      role: user?.memberships.find((m) => m.tenantId === tenantId)?.role ?? null,
    })),
  };
}

export async function loadMemberList(actor: Actor) {
  const tenants = await loadTenants();
  const tenantNames = new Map(tenants.map((t) => [t.id, t.name]));
  const isAdmin = actor.role === "group_admin";
  const scope = isAdmin ? null : actor.tenantId;

  const employees = await prisma.employee.findMany({
    where: scope
      ? {
          OR: [
            { staffs: { some: { tenantId: scope } } },
            { user: { memberships: { some: { tenantId: scope } } } },
          ],
        }
      : {},
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      user: USER_FIELDS,
      staffs: {
        select: { tenantId: true, isActive: true, membership: { select: { user: USER_FIELDS } } },
      },
    },
  });
  const rows = employees.map((e) => toRow(e, tenantNames));
  const inScope = (r: MemberRow) => r.isActive && (isAdmin || r.depts.some((d) => d.tenantId === scope));

  // 名簿とつながっていない古いデータ（1人1アカウント化より前に作った人など）
  const looseUsers = await prisma.user.findMany({
    where: {
      employeeId: null,
      memberships: { some: scope ? { tenantId: scope } : {} },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      memberships: {
        where: scope ? { tenantId: scope } : {},
        select: {
          tenantId: true,
          role: true,
          staff: { select: { name: true, employeeId: true } },
        },
      },
    },
  });
  const looseStaffs = await prisma.staff.findMany({
    where: {
      employeeId: null,
      isActive: true,
      membership: { is: null },
      ...(scope ? { tenantId: scope } : {}),
    },
    orderBy: [{ tenantId: "asc" }, { displayOrder: "asc" }],
    select: { id: true, name: true, tenantId: true },
  });

  return {
    tenants,
    active: rows.filter(inScope),
    inactive: rows.filter((r) => !inScope(r)),
    // スタッフ経由で名簿の人につながっているログインは、上の一覧に出ているので除く
    looseUsers: looseUsers
      .filter((u) => !u.memberships.some((m) => m.staff?.employeeId))
      .map((u) => {
        const m = u.memberships[0];
        return {
          userId: u.id,
          email: u.email,
          name: u.memberships.find((x) => x.staff)?.staff?.name ?? "",
          tenantId: m.tenantId,
          tenantName: tenantNames.get(m.tenantId) ?? "",
          role: m.role,
        };
      }),
    looseStaffs: looseStaffs.map((s) => ({
      ...s,
      tenantName: tenantNames.get(s.tenantId) ?? "",
    })),
  };
}

/** 1人の画面の中身。オーナーから見て、今の部署と関わりの無い人なら null */
export async function loadMemberDetail(actor: Actor, employeeId: string) {
  const tenants = await loadTenants();
  const tenantNames = new Map(tenants.map((t) => [t.id, t.name]));

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: USER_FIELDS,
      staffs: {
        include: {
          staffMenus: { select: { menuId: true } },
          membership: { select: { lineUserId: true, user: USER_FIELDS } },
        },
      },
      _count: { select: { events: true } },
    },
  });
  if (!employee) return null;

  const row = toRow(employee, tenantNames);
  const isAdmin = actor.role === "group_admin";
  const related =
    row.depts.some((d) => d.tenantId === actor.tenantId) ||
    employee.staffs.some((s) => s.tenantId === actor.tenantId);
  if (!isAdmin && !related) return null;

  const user = employee.user ?? employee.staffs.find((s) => s.membership)?.membership?.user ?? null;
  const assignedIds = row.depts.map((d) => d.tenantId);
  const menus = await prisma.menu.findMany({
    where: { tenantId: { in: assignedIds }, isActive: true },
    orderBy: { durationMinutes: "asc" },
    select: { id: true, name: true, tenantId: true },
  });
  const reservationCount = await prisma.reservation.count({
    where: { staffId: { in: employee.staffs.map((s) => s.id) } },
  });

  // 部署ごとの、予約を受ける人（スタッフ）と対応メニュー・LINE 通知の状態
  const deptDetails = row.depts.map((d) => {
    const membership = user?.memberships.find((m) => m.tenantId === d.tenantId) ?? null;
    const staff =
      employee.staffs.find((s) => s.tenantId === d.tenantId && s.isActive) ??
      employee.staffs.find((s) => s.id === membership?.staffId) ??
      null;
    return {
      ...d,
      staffId: staff?.id ?? null,
      staffOrder: staff?.displayOrder ?? null,
      menuIds: staff?.staffMenus.map((sm) => sm.menuId) ?? [],
      menus: menus.filter((m) => m.tenantId === d.tenantId),
      lineLinked: Boolean(membership?.lineUserId),
    };
  });

  return {
    row,
    userId: user?.id ?? null,
    deptDetails,
    displayOrder: employee.displayOrder,
    hasRecords: reservationCount > 0 || employee._count.events > 0,
  };
}
