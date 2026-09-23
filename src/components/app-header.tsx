import Link from "next/link";
import { logout } from "@/lib/actions";
import type { SessionData } from "@/lib/session";

/** どの画面にも出る、店舗名とログイン中の人の表示 */
export function AppHeader({
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
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{tenantName}</h1>
        <p className="text-sm text-neutral-500">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {children}

        <span className="ml-1 flex items-center gap-1.5 text-sm text-neutral-600">
          {session.name}
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              session.role === "owner"
                ? "border-violet-300 bg-violet-50 text-violet-800"
                : "border-neutral-300 bg-neutral-50 text-neutral-600"
            }`}
          >
            {session.role === "owner" ? "オーナー" : "スタッフ"}
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
