import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireOwner } from "@/lib/auth";
import { getTenant } from "@/lib/schedule";

// LayoutProps は Next.js が生成する型。ルートごとに用意される
// 設定の各項目（メニュー・メンバー・営業時間など）は、左のサイドバーから選ぶ（lib/sidebar-nav.ts）
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

      {children}
    </main>
  );
}
