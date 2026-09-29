import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { requireGroupAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTenant, deleteTenantAction, updateTenant } from "@/lib/settings-actions";

/** 部署（テナント）の追加・編集。全社を横断できる全社管理者だけが使える */
export default async function TenantsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireGroupAdmin();

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: { staffs: { where: { isActive: true } }, reservations: true, customers: true },
      },
    },
  });

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">部署を追加</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          追加すると、その場でこの部署の設定（担当者・メニュー・営業時間など）を
          続けられる画面に移ります。あとで「今どの部署を見ているか」の切り替えからも選べます。
        </p>

        <form action={createTenant} className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">部署名</span>
            <input
              type="text"
              name="name"
              required
              placeholder="例：不動産事業部"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              お客様向けURLの短い名前（任意）
            </span>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span className="text-neutral-500">/book/</span>
              <input
                type="text"
                name="slug"
                placeholder="fudousan"
                pattern="[a-zA-Z0-9-]*"
                maxLength={40}
                className="w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              追加する
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-4 font-semibold">部署一覧（{tenants.length}件）</h2>

        <div className="space-y-3">
          {tenants.map((tenant) => (
            <form
              key={tenant.id}
              action={updateTenant}
              className="grid items-end gap-2 rounded-md border border-neutral-200 p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
            >
              <input type="hidden" name="id" value={tenant.id} />

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">部署名</span>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={tenant.name}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">
                  URLの短い名前
                </span>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-neutral-500">/book/</span>
                  <input
                    type="text"
                    name="slug"
                    defaultValue={tenant.slug ?? ""}
                    pattern="[a-zA-Z0-9-]*"
                    maxLength={40}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </label>

              <span className="whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs text-neutral-600">
                担当者 {tenant._count.staffs}人
              </span>

              <button
                type="submit"
                className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                更新する
              </button>
            </form>
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-neutral-500">{session.name} でログイン中。</p>
      </section>

      <section className="rounded-lg border border-red-200 bg-red-50/40 p-4">
        <h2 className="mb-1 font-semibold text-red-900">解約（部署の完全削除）</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-600">
          契約が終わった部署のデータを完全に削除します。予約・顧客・スタッフ・設定など
          すべてが消え、元に戻せません。削除の前に必ず「データをエクスポート」で
          控えを保存してください。
        </p>

        <div className="space-y-3">
          {tenants.map((tenant) => (
            <details
              key={tenant.id}
              className="rounded-md border border-red-200 bg-white p-3 open:pb-4"
            >
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-800">{tenant.name}</span>
                <span className="text-xs text-neutral-500">
                  予約 {tenant._count.reservations}件・顧客 {tenant._count.customers}件・担当者{" "}
                  {tenant._count.staffs}人
                </span>
              </summary>

              <div className="mt-3 space-y-3 border-t border-red-100 pt-3">
                <a
                  href={`/api/settings/tenants/${tenant.id}/export`}
                  className="inline-block rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  データをエクスポート（JSON）
                </a>

                <form action={deleteTenantAction} className="space-y-2 rounded-md bg-red-50 p-3">
                  <input type="hidden" name="id" value={tenant.id} />

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-neutral-700">
                      確認のため、部署名「{tenant.name}」をそのまま入力してください
                    </span>
                    <input
                      type="text"
                      name="confirmName"
                      required
                      autoComplete="off"
                      placeholder={tenant.name}
                      className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                  </label>

                  <label className="flex items-start gap-2 text-xs text-neutral-700">
                    <input type="checkbox" name="agreed" className="mt-0.5" required />
                    <span>
                      予約・顧客・スタッフなど、この部署の全データが完全に削除され、
                      元に戻せないことを理解しました。
                    </span>
                  </label>

                  <SubmitButton
                    pendingText="削除しています…"
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                  >
                    この部署を完全に削除する
                  </SubmitButton>
                </form>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
