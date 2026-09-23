import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireOwner } from "@/lib/auth";
import { getTenant } from "@/lib/schedule";

const TABS = [
  { href: "/settings/menus", label: "メニュー" },
  { href: "/settings/staff", label: "スタッフ" },
  { href: "/settings/hours", label: "営業時間" },
  { href: "/settings/days", label: "日付ごと" },
  { href: "/settings/accounts", label: "アカウント" },
  { href: "/settings/store", label: "店舗" },
  { href: "/settings/history", label: "履歴" },
];

// LayoutProps は Next.js が生成する型。ルートごとに用意される
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  // 設定はオーナーのみ。スタッフはカレンダーへ戻される
  const session = await requireOwner();
  const tenant = await getTenant(session.tenantId);

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="設定" session={session}>
        <Link
          href="/calendar"
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          カレンダーへ
        </Link>
      </AppHeader>

      <nav className="mb-5 flex flex-wrap gap-1 border-b border-neutral-200 pb-px">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-t-md border border-transparent px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}
