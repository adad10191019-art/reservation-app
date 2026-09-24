import Link from "next/link";
import { logout, switchTenant } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import type { SessionData } from "@/lib/session";

/** どの画面にも出る、店舗名とログイン中の人の表示 */
export async function AppHeader({
  tenantName,
  subtitle,
  session,
  children,
  menuLinks,
}: {
  tenantName: string;
  subtitle: string;
  session: SessionData;
  /** 画面ごとの操作ボタン */
  children?: React.ReactNode;
  /** 歯車メニューに追加する、画面ごとのリンク（通知設定・ログアウトより上に出す） */
  menuLinks?: { href: string; label: string }[];
}) {
  // group_admin だけ、部署を切り替えるための一覧を持たせる
  const tenants =
    session.role === "group_admin"
      ? await prisma.tenant.findMany({
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        })
      : null;

  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{tenantName}</h1>
        <p className="text-sm text-neutral-500">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tenants && (
          <form action={switchTenant} className="flex items-center gap-1">
            <select
              name="tenantId"
              defaultValue={tenants.find((t) => t.name === tenantName)?.id}
              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm text-amber-900"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm text-amber-700 hover:bg-amber-50"
            >
              切替
            </button>
          </form>
        )}

        {children}

        <span className="ml-1 flex items-center gap-1.5 text-sm text-neutral-600">
          {session.name}
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              session.role === "owner"
                ? "border-violet-300 bg-violet-50 text-violet-800"
                : session.role === "group_admin"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-neutral-300 bg-neutral-50 text-neutral-600"
            }`}
          >
            {session.role === "owner"
              ? "オーナー"
              : session.role === "group_admin"
                ? "全社管理者"
                : "スタッフ"}
          </span>
        </span>

        {session.staffId && (
          <Link
            href="/my-schedule"
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            自分の予定
          </Link>
        )}

        <details className="group relative">
          <summary
            aria-label="設定"
            className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 marker:content-none hover:bg-neutral-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </summary>

          <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
            {menuLinks?.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/notify"
              className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              通知設定
            </Link>
            <Link
              href="/account"
              className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              アカウント情報
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              >
                ログアウト
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
