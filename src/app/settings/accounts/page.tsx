import Link from "next/link";
import { Banner } from "@/components/banner";
import { canResetPassword } from "@/lib/account-access";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  changeAccountRole,
  createAccount,
  deleteAccount,
  resetAccountPassword,
} from "@/lib/settings-actions";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOwner();

  const [memberships, staffs] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: {
        staff: true,
        user: {
          select: {
            id: true,
            email: true,
            isGroupAdmin: true,
            mustChangePassword: true,
            memberships: { select: { tenantId: true, tenant: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.staff.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: { membership: true },
    }),
  ]);

  // すでにアカウントがあるスタッフは選べないようにする
  const selectableStaffs = staffs.filter((s) => !s.membership);

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} notice={sp.notice} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">アカウントを追加</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          <strong>オーナー</strong>は全員の予約と設定を操作できます。
          <strong>スタッフ</strong>はカレンダーを見られますが、
          操作できるのは自分の担当分だけです。
        </p>

        <form action={createAccount} className="grid gap-3 sm:grid-cols-12">
          <label className="block sm:col-span-6">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              メールアドレス（ログインID）
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

          <label className="block sm:col-span-3">
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

        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-neutral-500">
          <li>
            最初のパスワードは<strong>メールアドレスと同じ</strong>です。本人は最初にログインしたときに、
            自分のパスワードに変えます。
          </li>
          <li>
            ほかの部署ですでに使われているメールアドレスなら、同じ人の兼任として、そのアカウントに
            この部署を追加します（1人1アカウント。パスワードは今のまま）。
          </li>
          <li>
            オーナー権限でも担当スタッフに紐づけられます。
            「普段はスタッフだが、代理でオーナーを務める」場合に使ってください。
          </li>
        </ul>

        {selectableStaffs.length === 0 && staffs.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            すべてのスタッフにアカウントが作られています。
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">この部署の担当（{memberships.length}件）</h2>
        <div className="space-y-3">
          {memberships.map((m) => {
            const user = m.user;
            const isSelf = user.id === session.userId;
            const otherTenants = user.memberships
              .filter((x) => x.tenantId !== session.tenantId)
              .map((x) => x.tenant.name);
            const resettable = canResetPassword(session, user);
            return (
              <div key={m.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{user.email}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      m.role === "owner"
                        ? "border-violet-300 bg-violet-50 text-violet-800"
                        : "border-neutral-300 bg-neutral-50 text-neutral-600"
                    }`}
                  >
                    {m.role === "owner" ? "オーナー" : "スタッフ"}
                  </span>
                  {m.staff && <span className="text-sm text-neutral-500">{m.staff.name}</span>}
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      m.lineUserId
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {m.lineUserId ? "LINE通知：紐づけ済み" : "LINE通知：未設定（メールで代替）"}
                  </span>
                  {user.mustChangePassword && (
                    <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-600">
                      まだ最初のパスワードのまま
                    </span>
                  )}
                  {isSelf && (
                    <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
                      自分
                    </span>
                  )}
                </div>
                {otherTenants.length > 0 && (
                  <p className="-mt-2 mb-3 text-xs text-neutral-500">
                    兼任：{otherTenants.join("・")} も担当しています
                  </p>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  {/* 権限の切り替え。オーナー不在を避けるため、最後の1人は下げられない */}
                  <form action={changeAccountRole}>
                    <input type="hidden" name="id" value={user.id} />
                    <input
                      type="hidden"
                      name="role"
                      value={m.role === "owner" ? "staff" : "owner"}
                    />
                    <button
                      type="submit"
                      disabled={m.role === "staff" && !m.staffId}
                      className="rounded-md border border-violet-300 px-3 py-1.5 text-sm text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {m.role === "owner" ? "スタッフに戻す" : "オーナーにする"}
                    </button>
                  </form>

                  {!isSelf && resettable && (
                    <form action={resetAccountPassword}>
                      <input type="hidden" name="id" value={user.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                      >
                        パスワードを初期状態に戻す
                      </button>
                    </form>
                  )}

                  {!isSelf && (
                    <form action={deleteAccount}>
                      <input type="hidden" name="id" value={user.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50"
                      >
                        この部署の担当から外す
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
        「LINE通知：紐づけ済み」は、本人が
        <Link href="/notify" className="underline hover:text-neutral-700">
          通知の受け取り
        </Link>
        画面でLINEを紐づけているかどうかです。紐づけていても、公式アカウントを友だち追加していなければ
        実際には届きません（それはこの画面からは確認できません）。未設定の人には、ログイン用の
        メールアドレス宛にメールで通知が届きます。
        <br />
        「パスワードを初期状態に戻す」を押すと、パスワードがメールアドレスと同じになり、
        本人は次のログインで新しいパスワードを決めます。ほかの部署も担当している人は、全社管理者が戻します。
        自分のパスワードは、歯車の「アカウント情報」から変えられます。
        <br />
        「この部署の担当から外す」では、ほかの部署の担当はそのまま残ります。
        どこの担当でもなくなった人のアカウントは消えます（社員名簿に載っている人は「全社の1日」だけ使えるまま残ります）。
        <br />
        オーナーのアカウントは最低1つ必要です。
        スタッフ権限のアカウントは、担当するスタッフと1対1で紐づきます。
      </p>
    </div>
  );
}
