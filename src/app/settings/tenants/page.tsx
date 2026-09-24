import { Banner } from "@/components/banner";
import { requireGroupAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTenant, updateTenant } from "@/lib/settings-actions";

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
      _count: { select: { staffs: { where: { isActive: true } } } },
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

        <p className="mt-4 text-xs leading-relaxed text-neutral-500">
          {session.name} でログイン中。部署の削除はここからはできません
          （予約データが紐づくため、必要な場合はご相談ください）。
        </p>
      </section>
    </div>
  );
}
