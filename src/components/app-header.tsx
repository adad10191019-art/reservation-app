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
}: {
  tenantName: string;
  subtitle: string;
  session: SessionData;
  /** 画面ごとの操作ボタン */
  children?: React.ReactNode;
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

        <Link
          href="/notify"
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          通知設定
        </Link>

        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            ログアウト
          </button>
        </form>
      </div>
    </header>
  );
}
