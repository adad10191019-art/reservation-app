import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { updateOwnAccount } from "@/lib/account-actions";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLE_LABEL: Record<string, string> = {
  owner: "オーナー",
  staff: "スタッフ",
  group_admin: "全社管理者",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, role: true },
  });

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <AppHeader tenantName="アカウント情報" subtitle="ログイン情報の変更" session={session}>
        <Link
          href="/calendar"
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          カレンダーへ
        </Link>
      </AppHeader>

      <Banner error={sp.error} done={sp.done} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">ログイン情報</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          現在: {user?.email}（{user ? ROLE_LABEL[user.role] ?? user.role : ""}）
        </p>

        <form action={updateOwnAccount} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              新しいメールアドレス
            </span>
            <input
              type="email"
              name="email"
              required
              defaultValue={user?.email}
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              新しいパスワード（変更する場合のみ）
            </span>
            <input
              type="password"
              name="newPassword"
              minLength={8}
              autoComplete="new-password"
              placeholder="8文字以上（空欄なら変更しない）"
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              現在のパスワード（確認のため）
            </span>
            <input
              type="password"
              name="currentPassword"
              required
              autoComplete="current-password"
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            変更する
          </button>
        </form>
      </section>
    </main>
  );
}
