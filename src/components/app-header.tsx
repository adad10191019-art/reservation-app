import Link from "next/link";
import { cookies } from "next/headers";
import {
  NavLinks,
  SettingsGroup,
  SidebarDrawer,
  SidebarPinButton,
  TenantSelect,
} from "@/components/sidebar-parts";
import { logout } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import type { AnySession } from "@/lib/session";
import {
  SETTINGS_PIN_COOKIE,
  SIDEBAR_PIN_COOKIE,
  type SidebarMode,
  buildNav,
  sidebarModeOf,
} from "@/lib/sidebar-nav";

/** 左に出したままのサイドバーの見せ方（幅は globals.css の本文の余白と合わせる） */
const ASIDE_VISIBILITY: Record<SidebarMode, string> = {
  auto: "hidden lg:flex",
  pinned: "hidden md:flex",
  unpinned: "hidden",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "オーナー",
  group_admin: "全社管理者",
  member: "社員",
  staff: "一般",
};

/**
 * どの画面にも出る、画面の名前と、左のサイドバー（スマホなどでは「≡」で横から出す）。
 * 毎日使う画面・設定・部署の切り替え・アカウントはサイドバーに、
 * その画面だけの操作（週表示へ・予約を追加・戻る など）は children として画面の上に出す。
 */
export async function AppHeader({
  tenantName,
  subtitle,
  session,
  children,
  menuLinks,
}: {
  tenantName: string;
  subtitle: string;
  /** 社員ログイン（部署に属さない人）のときは、部署の切り替え・通知設定・自分の予定を出さない */
  session: AnySession;
  /** 画面ごとの操作ボタン */
  children?: React.ReactNode;
  /** 画面ごとの補助のリンク（予定の設定など）。操作ボタンの前に出す */
  menuLinks?: { href: string; label: string }[];
}) {
  // 部署を切り替えるための一覧。全社管理者は全部署、兼任の人は自分の担当部署（2つ以上のとき）
  const tenants =
    session.role === "group_admin"
      ? await prisma.tenant.findMany({
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        })
      : session.role === "member"
        ? null
        : await prisma.membership
            .findMany({
              where: { userId: session.userId },
              orderBy: { createdAt: "asc" },
              select: { tenant: { select: { id: true, name: true } } },
            })
            .then((rows) => (rows.length >= 2 ? rows.map((r) => r.tenant) : null));

  const store = await cookies();
  const mode = sidebarModeOf(store.get(SIDEBAR_PIN_COOKIE)?.value);
  const settingsPinned = store.get(SETTINGS_PIN_COOKIE)?.value === "1";
  const nav = buildNav(session);
  const deptName = session.role === "member" ? "全社の1日" : tenantName;

  const sidebarBody = (
    <div className="flex flex-1 flex-col gap-4 px-3 pb-4">
      <div>
        {tenants ? (
          <>
            <p className="mb-1 px-1 text-xs text-neutral-500">部署</p>
            <TenantSelect tenants={tenants} currentId={session.tenantId} />
          </>
        ) : (
          <p className="px-1 font-bold tracking-tight">{deptName}</p>
        )}
      </div>

      <nav aria-label="メニュー" className="space-y-3">
        <NavLinks items={nav.main} />
        {nav.settings && <SettingsGroup items={nav.settings} pinned={settingsPinned} />}
      </nav>

      <div className="mt-auto space-y-0.5 border-t border-neutral-200 pt-3">
        <p className="flex flex-wrap items-center gap-1.5 px-3 pb-1 text-sm text-neutral-700">
          {session.name}
          <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-600">
            {ROLE_LABEL[session.role] ?? session.role}
          </span>
        </p>
        <NavLinks
          items={[
            ...(session.role !== "member"
              ? [{ href: "/notify", label: "通知設定", match: ["/notify"] }]
              : []),
            { href: "/account", label: "アカウント情報", match: ["/account"] },
          ]}
        />
        <form action={logout}>
          <button
            type="submit"
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* 左に出したままのサイドバー */}
      <aside
        data-sidebar={mode}
        className={`${ASIDE_VISIBILITY[mode]} fixed inset-y-0 left-0 z-30 w-60 flex-col overflow-y-auto border-r border-neutral-200 bg-white`}
      >
        <div className="flex justify-end px-2 pt-2">
          <SidebarPinButton pinned />
        </div>
        {sidebarBody}
      </aside>

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarDrawer mode={mode}>
            {/* スマホの幅では固定できないので、固定のボタンは中くらいの幅から出す */}
            <div className="px-2 pb-1">
              <SidebarPinButton pinned={false} className="hidden md:inline-flex" />
            </div>
            {sidebarBody}
          </SidebarDrawer>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight">{tenantName}</h1>
            <p className="text-sm text-neutral-500">{subtitle}</p>
          </div>
        </div>

        {(children || menuLinks) && (
          <div className="flex flex-wrap items-center gap-2">
            {menuLinks?.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {item.label}
              </Link>
            ))}
            {children}
          </div>
        )}
      </header>
    </>
  );
}
