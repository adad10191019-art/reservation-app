import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { requireGroupAdmin } from "@/lib/auth";
import {
  createEmployee,
  deleteEmployee,
  linkStaffToEmployee,
  updateEmployee,
} from "@/lib/employee-actions";
import { employeeOptionLabel } from "@/lib/employee-names";
import { prisma } from "@/lib/prisma";

/**
 * 社員名簿（会社全体で1つ）。全社管理者だけが使える。
 * 上で社員を登録し、下で各部署のスタッフを「名簿のどの人か」にひも付ける。
 */
export default async function EmployeesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  await requireGroupAdmin();

  const [employees, tenants] = await Promise.all([
    prisma.employee.findMany({
      orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }],
      include: {
        staffs: { include: { tenant: { select: { name: true } } } },
        _count: { select: { events: true } },
      },
    }),
    prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        staffs: {
          orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, isActive: true, employeeId: true },
        },
      },
    }),
  ]);
  const activeEmployees = employees.filter((e) => e.isActive);
  const unlinkedCount = tenants.reduce(
    (n, t) => n + t.staffs.filter((s) => s.isActive && !s.employeeId).length,
    0,
  );

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />

      <p className="text-sm leading-relaxed text-neutral-600">
        会社全体の社員名簿です（全部署で共通）。「全社の1日」には、ここで在籍にしている人が1人1列で並びます。
        兼任の人は、各部署のスタッフを同じ社員にひも付けてください。ひも付けると、どの部署の予約・予定も
        その人の全部署の予約受付で「空いていない時間」になります。
      </p>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">社員を追加</h2>
        <form action={createEmployee} className="flex flex-wrap items-end gap-2">
          <label className="block min-w-48 flex-1">
            <span className="mb-1 block text-xs font-medium text-neutral-600">名前</span>
            <input
              type="text"
              name="name"
              required
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <SubmitButton
            pendingText="追加中…"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            追加
          </SubmitButton>
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          部署のスタッフになっている人は、下の「スタッフとのひも付け」で「名簿に新しく作る」を選ぶと、
          名前を打ち直さずに登録できます。
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">
          社員名簿（在籍 {activeEmployees.length}名 / 全 {employees.length}名）
        </h2>
        {employees.length === 0 ? (
          <p className="text-sm text-neutral-500">まだ登録されていません。</p>
        ) : (
          <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {employees.map((e) => (
              <form
                key={e.id}
                action={updateEmployee}
                className={`flex flex-wrap items-center gap-2 px-3 py-2 ${e.isActive ? "" : "bg-neutral-50"}`}
              >
                <input type="hidden" name="id" value={e.id} />
                <input
                  type="text"
                  name="name"
                  defaultValue={e.name}
                  required
                  aria-label="名前"
                  className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                />
                <label className="flex items-center gap-1 text-xs text-neutral-600">
                  表示順
                  <input
                    type="number"
                    name="displayOrder"
                    defaultValue={e.displayOrder}
                    className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-neutral-600">
                  <input type="checkbox" name="isActive" defaultChecked={e.isActive} />
                  在籍
                </label>
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
                  {e.staffs.length > 0
                    ? e.staffs.map((s) => `${s.tenant.name}（${s.name}）`).join("・")
                    : "部署なし（名簿のみ）"}
                  {e._count.events > 0 && `　予定 ${e._count.events}件`}
                </span>
                <button
                  type="submit"
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  保存
                </button>
                {/* 予定もひも付けも無い行だけ消せる（重複して作った行の後始末用） */}
                {e.staffs.length === 0 && e._count.events === 0 && (
                  <button
                    type="submit"
                    formAction={deleteEmployee}
                    formNoValidate
                    className="rounded-md border border-red-200 bg-white px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                  >
                    削除
                  </button>
                )}
              </form>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-semibold">スタッフとのひも付け</h2>
        <p className="mb-3 text-xs text-neutral-500">
          {unlinkedCount > 0
            ? `ひも付いていない在籍中のスタッフが ${unlinkedCount}名 います。`
            : "在籍中のスタッフは全員ひも付いています。"}
          兼任の人は、2つ目以降の部署では「名簿に新しく作る」ではなく、一覧からその人（カッコ内は今の所属部署）を
          選んでください。1つの部署に同じ社員を2回ひも付けることはできません。
        </p>
        <div className="space-y-3">
          {tenants.map((tenant) => (
            <div key={tenant.id} className="rounded-lg border border-neutral-200 bg-white">
              <h3 className="border-b border-neutral-100 px-3 py-2 text-sm font-medium">
                {tenant.name}
              </h3>
              {tenant.staffs.length === 0 ? (
                <p className="px-3 py-2 text-sm text-neutral-500">スタッフがいません。</p>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {tenant.staffs.map((staff) => (
                    <form
                      key={staff.id}
                      action={linkStaffToEmployee}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                    >
                      <input type="hidden" name="staffId" value={staff.id} />
                      <span className="w-40 truncate text-sm">
                        {staff.name}
                        {!staff.isActive && (
                          <span className="ml-1 text-xs text-neutral-400">（無効）</span>
                        )}
                      </span>
                      <span className="text-xs text-neutral-400">→</span>
                      <select
                        name="employeeId"
                        defaultValue={staff.employeeId ?? ""}
                        aria-label={`${staff.name} のひも付け先`}
                        className={`rounded-md border px-2 py-1 text-sm ${
                          staff.employeeId ? "border-neutral-300" : "border-amber-300 bg-amber-50"
                        }`}
                      >
                        <option value="">（ひも付けない）</option>
                        <option value="new">＋ 名簿に新しく作る（{staff.name}）</option>
                        {employees
                          .filter((e) => e.isActive || e.id === staff.employeeId)
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {employeeOptionLabel(
                                e.name,
                                e.staffs.map((s) => s.tenant.name),
                              )}
                            </option>
                          ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
                      >
                        保存
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
