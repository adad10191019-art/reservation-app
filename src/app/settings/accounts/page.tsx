import { Banner } from "@/components/banner";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createAccount,
  deleteAccount,
  resetAccountPassword,
} from "@/lib/settings-actions";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOwner();

  const [users, staffs] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ role: "asc" }, { email: "asc" }],
      include: { staff: true },
    }),
    prisma.staff.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: { user: true },
    }),
  ]);

  // すでにアカウントがあるスタッフは選べないようにする
  const selectableStaffs = staffs.filter((s) => !s.user);

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">アカウントを追加</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          <strong>オーナー</strong>は全員の予約と設定を操作できます。
          <strong>スタッフ</strong>はカレンダーを見られますが、
          操作できるのは自分の担当分だけです。
        </p>

        <form action={createAccount} className="grid gap-3 sm:grid-cols-12">
          <label className="block sm:col-span-5">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              メールアドレス
            </span>
            <input
              type="email"
              name="email"
              required
              placeholder="staff@example.com"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block sm:col-span-3">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              パスワード
            </span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="8文字以上"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">権限</span>
            <select
              name="role"
              defaultValue="staff"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="staff">スタッフ</option>
              <option value="owner">オーナー</option>
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              担当スタッフ
            </span>
            <select
              name="staffId"
              defaultValue=""
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">（なし）</option>
              {selectableStaffs.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-12">
            <button
              type="submit"
              className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              追加する
            </button>
          </div>
        </form>

        {selectableStaffs.length === 0 && staffs.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            すべてのスタッフにアカウントが作られています。
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">登録済みのアカウント（{users.length}件）</h2>
        <div className="space-y-3">
          {users.map((user) => {
            const isSelf = user.id === session.userId;
            return (
              <div
                key={user.id}
                className="rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{user.email}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      user.role === "owner"
                        ? "border-violet-300 bg-violet-50 text-violet-800"
                        : "border-neutral-300 bg-neutral-50 text-neutral-600"
                    }`}
                  >
                    {user.role === "owner" ? "オーナー" : "スタッフ"}
                  </span>
                  {user.staff && (
                    <span className="text-sm text-neutral-500">{user.staff.name}</span>
                  )}
                  {isSelf && (
                    <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
                      自分
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <form action={resetAccountPassword} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={user.id} />
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-600">
                        新しいパスワード
                      </span>
                      <input
                        type="password"
                        name="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="8文字以上"
                        className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                    >
                      変更する
                    </button>
                  </form>

                  {!isSelf && (
                    <form action={deleteAccount}>
                      <input type="hidden" name="id" value={user.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50"
                      >
                        削除する
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-neutral-500">
        自分自身のアカウントは削除できません。
        また、オーナーのアカウントは最低1つ必要です。
        <br />
        スタッフ権限のアカウントは、担当するスタッフと1対1で紐づきます。
      </p>
    </div>
  );
}
