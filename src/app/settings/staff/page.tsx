import { Banner } from "@/components/banner";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveStaff } from "@/lib/settings-actions";

export default async function StaffSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOwner();

  const [staffs, menus] = await Promise.all([
    prisma.staff.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }],
      include: { staffMenus: true },
    }),
    prisma.menu.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: { durationMinutes: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">スタッフを追加</h2>
        <p className="mb-4 text-xs text-neutral-500">
          対応メニューは、そのスタッフが担当できるものにチェックを入れてください。
          空き枠の計算に使われます。
        </p>
        <StaffForm staff={null} menus={menus} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">登録済みのスタッフ（{staffs.length}名）</h2>
        <div className="space-y-3">
          {staffs.map((staff) => (
            <div
              key={staff.id}
              className={`rounded-lg border p-4 ${
                staff.isActive
                  ? "border-neutral-200 bg-white"
                  : "border-neutral-200 bg-neutral-50"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium">{staff.name}</h3>
                {!staff.isActive && (
                  <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
                    退職・休止中
                  </span>
                )}
              </div>
              <StaffForm
                staff={{
                  id: staff.id,
                  name: staff.name,
                  displayOrder: staff.displayOrder,
                  isActive: staff.isActive,
                  menuIds: staff.staffMenus.map((sm) => sm.menuId),
                }}
                menus={menus}
              />
            </div>
          ))}
          {staffs.length === 0 && (
            <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
              まだスタッフがいません。
            </p>
          )}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-neutral-500">
        スタッフは削除できません。退職した場合は「在籍中」のチェックを外してください。
        過去の予約に担当として残るため、消すと記録が壊れます。
        勤務時間は「営業時間」タブで設定します。
      </p>
    </div>
  );
}

function StaffForm({
  staff,
  menus,
}: {
  staff: {
    id: string;
    name: string;
    displayOrder: number;
    isActive: boolean;
    menuIds: string[];
  } | null;
  menus: { id: string; name: string }[];
}) {
  return (
    <form action={saveStaff} className="space-y-3">
      {staff && <input type="hidden" name="id" value={staff.id} />}

      <div className="grid gap-3 sm:grid-cols-12">
        <label className="block sm:col-span-6">
          <span className="mb-1 block text-xs font-medium text-neutral-600">名前</span>
          <input
            type="text"
            name="name"
            required
            defaultValue={staff?.name ?? ""}
            placeholder="佐藤"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="block sm:col-span-3">
          <span className="mb-1 block text-xs font-medium text-neutral-600">並び順</span>
          <input
            type="number"
            name="displayOrder"
            defaultValue={staff?.displayOrder ?? 0}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        <div className="flex items-end sm:col-span-3">
          <label className="flex items-center gap-1.5 pb-1.5 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={staff?.isActive ?? true}
              className="size-4"
            />
            在籍中
          </label>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-neutral-600">対応メニュー</legend>
        {menus.length === 0 ? (
          <p className="text-sm text-neutral-500">
            受付中のメニューがありません。先にメニューを登録してください。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {menus.map((menu) => (
              <label
                key={menu.id}
                className="cursor-pointer rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-50 has-checked:border-sky-500 has-checked:bg-sky-50 has-checked:text-sky-900"
              >
                <input
                  type="checkbox"
                  name="menuIds"
                  value={menu.id}
                  defaultChecked={staff?.menuIds.includes(menu.id) ?? false}
                  className="sr-only"
                />
                {menu.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <button
        type="submit"
        className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
      >
        {staff ? "更新する" : "追加する"}
      </button>
    </form>
  );
}
