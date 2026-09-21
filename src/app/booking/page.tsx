import Link from "next/link";
import { createReservation } from "@/lib/actions";
import { findAvailability } from "@/lib/availability";
import { prisma } from "@/lib/prisma";
import { getCurrentTenant } from "@/lib/schedule";
import { formatDateLabel, sanitizeDate, toHm } from "@/lib/time";

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    menuId?: string;
    staffId?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const date = sanitizeDate(sp.date);
  const tenant = await getCurrentTenant();

  const [menus, staffs, customers] = await Promise.all([
    prisma.menu.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { durationMinutes: "asc" },
    }),
    prisma.staff.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
    prisma.customer.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    }),
  ]);

  const menu = menus.find((m) => m.id === sp.menuId) ?? menus[0];
  const staff = staffs.find((s) => s.id === sp.staffId);
  const staffNames = new Map(staffs.map((s) => [s.id, s.name]));

  const availability = menu
    ? await findAvailability({
        tenantId: tenant.id,
        date,
        menuId: menu.id,
        staffId: staff?.id,
      })
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{tenant.name}</h1>
          <p className="text-sm text-neutral-500">空き枠検索・予約登録</p>
        </div>
        <Link
          href={`/calendar?date=${date}`}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          カレンダーへ
        </Link>
      </header>

      {sp.error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {sp.error}
        </p>
      )}

      <form
        method="get"
        action="/booking"
        className="mb-5 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-4"
      >
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-600">メニュー</span>
          <select
            name="menuId"
            defaultValue={menu?.id}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {menus.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}（{m.durationMinutes}分 / {m.price.toLocaleString()}円）
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">日付</span>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">担当</span>
          <select
            name="staffId"
            defaultValue={staff?.id ?? ""}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">誰でもいい</option>
            {staffs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            空き枠を検索
          </button>
        </div>
      </form>

      {!menu ? (
        <p className="text-sm text-neutral-500">メニューが登録されていません。</p>
      ) : (
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-1 font-semibold">{formatDateLabel(date)} の空き枠</h2>
          <p className="mb-4 text-xs text-neutral-500">
            {menu.name}：所要 {menu.durationMinutes}分
            {menu.bufferMinutes > 0 && ` ＋ 片付け ${menu.bufferMinutes}分`}
            {" = "}
            <strong>{availability?.requiredMinutes}分</strong>の枠が必要
            {staff ? ` / 担当：${staff.name}` : " / 担当：誰でもいい"}
          </p>

          {!availability || availability.merged.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
              この日に空きはありません。
              <br />
              日付・メニュー・担当を変えて探してみてください。
            </p>
          ) : (
            <form action={createReservation} className="space-y-5">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="menuId" value={menu.id} />
              <input type="hidden" name="filterStaffId" value={staff?.id ?? ""} />

              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  時間を選ぶ（{availability.merged.length}枠）
                </legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {availability.merged.map((slot) => {
                    // 「誰でもいい」のときは、その枠を担当できる先頭のスタッフを割り当てる
                    const assignedStaffId = staff?.id ?? slot.staffIds[0];
                    return (
                      <label
                        key={slot.startMinutes}
                        className="cursor-pointer rounded-md border border-neutral-300 px-2 py-2 text-center text-sm hover:bg-neutral-50 has-checked:border-sky-500 has-checked:bg-sky-50 has-checked:text-sky-900"
                      >
                        <input
                          type="radio"
                          name="slot"
                          value={`${slot.startMinutes}|${assignedStaffId}`}
                          className="sr-only"
                        />
                        <span className="block font-medium tabular-nums">
                          {toHm(slot.startMinutes)}
                        </span>
                        {!staff && (
                          <span className="block text-xs text-neutral-500">
                            {staffNames.get(assignedStaffId)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-medium">顧客</legend>

                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    既存の顧客から選ぶ
                  </span>
                  <select
                    name="customerId"
                    defaultValue=""
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">（新規のお客様）</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? `（${c.phone}）` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    新規のお名前
                  </span>
                  <input
                    type="text"
                    name="newCustomerName"
                    placeholder="山田 花子"
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    電話番号（任意）
                  </span>
                  <input
                    type="tel"
                    name="newCustomerPhone"
                    placeholder="090-1234-5678"
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </fieldset>

              <button
                type="submit"
                className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 sm:w-auto"
              >
                この内容で予約する
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
