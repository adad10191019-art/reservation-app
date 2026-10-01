import { redirect } from "next/navigation";
import { Banner } from "@/components/banner";
import { setFirstPassword } from "@/lib/account-actions";
import { logout } from "@/lib/actions";
import { requireSessionForFirstPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 最初のログインで出す、パスワード変更の画面。
 * 発行したまま（初期パスワード＝メールアドレス）の間は、どの画面を開いてもここへ来る（auth.ts）。
 */
export default async function FirstPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireSessionForFirstPassword();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, mustChangePassword: true },
  });
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/account");

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-bold tracking-tight">パスワードを決めてください</h1>
      <p className="mb-5 text-sm leading-relaxed text-neutral-600">
        今は最初のパスワード（メールアドレスと同じ）のままです。
        ほかの人に入られないよう、自分だけのパスワードに変えてから使い始めてください。
      </p>

      <Banner error={sp.error} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="mb-4 text-xs text-neutral-500">ログインID：{user.email}</p>
        <form action={setFirstPassword} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">新しいパスワード</span>
            <input
              type="password"
              name="newPassword"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="8文字以上"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">
              もう一度（確認のため）
            </span>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            このパスワードにする
          </button>
        </form>
      </section>

      <form action={logout} className="mt-4 text-center">
        <button type="submit" className="text-sm text-neutral-500 underline hover:text-neutral-700">
          ログアウト
        </button>
      </form>
    </main>
  );
}
