import { redirect } from "next/navigation";
import { login } from "@/lib/actions";
import { getSession } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  // すでにログインしていれば素通しする
  if (await getSession()) redirect("/calendar");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
      <h1 className="mb-1 text-xl font-bold tracking-tight">予約管理システム</h1>
      <p className="mb-6 text-sm text-neutral-500">ログインしてください</p>

      {sp.error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {sp.error}
        </p>
      )}

      <form
        action={login}
        className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            メールアドレス
          </span>
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">パスワード</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          ログイン
        </button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        動作確認用のアカウントは <code>prisma/seed.ts</code> に記載しています。
      </p>
    </main>
  );
}
