import { Banner } from "@/components/banner";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteMenu, saveMenu } from "@/lib/settings-actions";

export default async function MenuSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOwner();

  const menus = await prisma.menu.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ isActive: "desc" }, { durationMinutes: "asc" }],
  });

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">メニューを追加</h2>
        <p className="mb-4 text-xs text-neutral-500">
          片付け時間は、施術後に枠を空けておきたい時間。空き枠の計算に含まれます。
        </p>
        <MenuForm menu={null} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">登録済みのメニュー（{menus.length}件）</h2>
        <div className="space-y-3">
          {menus.map((menu) => (
            <div
              key={menu.id}
              className={`rounded-lg border p-4 ${
                menu.isActive
                  ? "border-neutral-200 bg-white"
                  : "border-neutral-200 bg-neutral-50"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{menu.name}</h3>
                  {!menu.isActive && (
                    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
                      停止中
                    </span>
                  )}
                </div>
                <DeleteMenuForm menuId={menu.id} />
              </div>
              <MenuForm menu={menu} />
            </div>
          ))}
          {menus.length === 0 && (
            <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
              まだメニューがありません。
            </p>
          )}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-neutral-500">
        削除できるのは、まだ1件も予約が無いメニューだけです。
        すでに使われているものは、消さずに「受付中」のチェックを外してください。
      </p>
    </div>
  );
}

function MenuForm({
  menu,
}: {
  menu: {
    id: string;
    name: string;
    durationMinutes: number;
    bufferMinutes: number;
    price: number;
    isActive: boolean;
  } | null;
}) {
  return (
    <form action={saveMenu} className="grid gap-3 sm:grid-cols-12">
      {menu && <input type="hidden" name="id" value={menu.id} />}

      <label className="block sm:col-span-4">
        <span className="mb-1 block text-xs font-medium text-neutral-600">メニュー名</span>
        <input
          type="text"
          name="name"
          required
          defaultValue={menu?.name ?? ""}
          placeholder="カット"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-neutral-600">所要（分）</span>
        <input
          type="number"
          name="durationMinutes"
          required
          min={5}
          max={480}
          step={5}
          defaultValue={menu?.durationMinutes ?? 60}
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-neutral-600">片付け（分）</span>
        <input
          type="number"
          name="bufferMinutes"
          required
          min={0}
          max={120}
          step={5}
          defaultValue={menu?.bufferMinutes ?? 0}
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-neutral-600">料金（円）</span>
        <input
          type="number"
          name="price"
          required
          min={0}
          step={100}
          defaultValue={menu?.price ?? 0}
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </label>

      <div className="flex items-end gap-3 sm:col-span-2">
        <label className="flex items-center gap-1.5 pb-1.5 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={menu?.isActive ?? true}
            className="size-4"
          />
          受付中
        </label>
      </div>

      <div className="flex items-center gap-2 sm:col-span-12">
        <button
          type="submit"
          className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {menu ? "更新する" : "追加する"}
        </button>
      </div>
    </form>
  );
}

function DeleteMenuForm({ menuId }: { menuId: string }) {
  return (
    <form action={deleteMenu}>
      <input type="hidden" name="id" value={menuId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50"
      >
        削除する
      </button>
    </form>
  );
}
