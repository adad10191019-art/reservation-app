import Link from "next/link";
import { notFound } from "next/navigation";
import { findAvailability } from "@/lib/availability";
import { filterBookableStarts } from "@/lib/booking-window";
import {
  createCustomerReservation,
  customerLogout,
  devLogin,
  startLineLogin,
} from "@/lib/customer-actions";
import { getActiveCustomer } from "@/lib/customer-store";
import { isDevFallbackAllowed, isLineConfigured } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/submit-button";
import { findTenantByHandle, tenantHandle } from "@/lib/tenant";
import { addDays, formatDateLabel, sanitizeDate, toHm, todayString } from "@/lib/time";

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ shop: string }>;
  searchParams: Promise<{ date?: string; menuId?: string; staffId?: string; error?: string }>;
}) {
  const { shop } = await params;
  const sp = await searchParams;

  const tenant = await findTenantByHandle(shop);
  if (!tenant) notFound();

  // URLに載せる値（短い名前があればそちら）
  const handle = tenantHandle(tenant);
  const tenantId = tenant.id;

  const date = sanitizeDate(sp.date);
  const loggedIn = await getActiveCustomer(tenantId);

  const menus = await prisma.menu.findMany({
    where: { tenantId, isActive: true },
    orderBy: { durationMinutes: "asc" },
  });
  const menu = menus.find((m) => m.id === sp.menuId) ?? menus[0];

  const staffNames = new Map(
    (
      await prisma.staff.findMany({ where: { tenantId, isActive: true } })
    ).map((s) => [s.id, s.name]),
  );

  // 「誰でもいい」で問い合わせる。担当者ごとの内訳（perStaff）も同時に
  // 手に入るので、指名したい場合はそこから絞り込む（問い合わせを増やさない）
  const availability = menu
    ? await findAvailability({ tenantId, date, menuId: menu.id })
    : null;

  // このメニューに対応できるスタッフだけを選択肢にする
  const eligibleStaff = availability?.perStaff ?? [];
  const selectedStaffId =
    sp.staffId && eligibleStaff.some((s) => s.staffId === sp.staffId) ? sp.staffId : "";

  const rawStarts = selectedStaffId
    ? (eligibleStaff.find((s) => s.staffId === selectedStaffId)?.starts ?? [])
    : (availability?.merged ?? []).map((s) => s.startMinutes);

  // 受付期間と締め切りで絞る
  const bookableStarts = new Set(
    filterBookableStarts(rawStarts, {
      date,
      windowDays: tenant.bookingWindowDays,
      leadMinutes: tenant.bookingLeadMinutes,
    }),
  );

  const slots = selectedStaffId
    ? rawStarts
        .filter((m) => bookableStarts.has(m))
        .map((m) => ({ startMinutes: m, staffIds: [selectedStaffId] }))
    : (availability?.merged ?? []).filter((s) => bookableStarts.has(s.startMinutes));

  const lastDate = addDays(todayString(), tenant.bookingWindowDays);

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{tenant.name}</h1>
          <p className="text-sm text-neutral-500">ネット予約</p>
        </div>

        {loggedIn ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/book/${handle}/mine`}
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              予約の確認
            </Link>
            <span className="text-sm text-neutral-600">{loggedIn.name} 様</span>
            <form action={customerLogout}>
              <input type="hidden" name="tenantId" value={tenantId} />
              <button
                type="submit"
                className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50"
              >
                ログアウト
              </button>
            </form>
          </div>
        ) : null}
      </header>

      {sp.error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {sp.error}
        </p>
      )}

      {/* 条件を選ぶ */}
      <form
        method="get"
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
          <span className="mb-1 block text-xs font-medium text-neutral-600">担当</span>
          <select
            name="staffId"
            defaultValue={selectedStaffId}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">誰でもいい（最短）</option>
            {eligibleStaff.map((s) => (
              <option key={s.staffId} value={s.staffId}>
                {s.staffName}
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
            min={todayString()}
            max={lastDate}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            空き時間を見る
          </button>
        </div>
      </form>

      {!menu ? (
        <p className="text-sm text-neutral-500">ただいま受付中のメニューがありません。</p>
      ) : (
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-1 font-semibold">{formatDateLabel(date)} の空き時間</h2>
          <p className="mb-4 text-xs text-neutral-500">
            {menu.name}：{menu.durationMinutes}分 / {menu.price.toLocaleString()}円
          </p>

          {slots.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
              この日に空きはありません。
              <br />
              日付やメニューを変えてお試しください。
            </p>
          ) : loggedIn ? (
            <form action={createCustomerReservation} className="space-y-4">
              <input type="hidden" name="tenantId" value={tenantId} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="menuId" value={menu.id} />

              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  ご希望の時間を選んでください
                </legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <label
                      key={slot.startMinutes}
                      className="cursor-pointer rounded-md border-2 border-neutral-300 px-2 py-2.5 text-center text-sm transition-colors hover:bg-neutral-50 has-checked:border-sky-600 has-checked:bg-sky-100 has-checked:text-sky-900 has-checked:ring-2 has-checked:ring-sky-300"
                    >
                      <input
                        type="radio"
                        name="slot"
                        value={`${slot.startMinutes}|${slot.staffIds[0]}`}
                        className="sr-only"
                      />
                      <span className="block font-medium tabular-nums">
                        {toHm(slot.startMinutes)}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {staffNames.get(slot.staffIds[0])}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <SubmitButton
                pendingText="予約しています…"
                className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700"
              >
                この時間で予約する
              </SubmitButton>

              <p className="text-xs text-neutral-500">
                {loggedIn.name} 様として予約します。
              </p>
            </form>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => (
                  <span
                    key={slot.startMinutes}
                    className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-2.5 text-center text-sm text-neutral-500"
                  >
                    <span className="block font-medium tabular-nums">
                      {toHm(slot.startMinutes)}
                    </span>
                    <span className="block text-xs">
                      {staffNames.get(slot.staffIds[0])}
                    </span>
                  </span>
                ))}
              </div>

              <LoginBox tenant={tenant} handle={handle} date={date} menuId={menu.id} />
            </>
          )}
        </section>
      )}

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        ご予約は{tenant.bookingWindowDays}日先までお受けしています。
        開始の{Math.floor(tenant.bookingLeadMinutes / 60) >= 1
          ? `${Math.floor(tenant.bookingLeadMinutes / 60)}時間`
          : `${tenant.bookingLeadMinutes}分`}
        前を過ぎたお時間は、お電話でご相談ください。
      </p>
    </main>
  );
}

function LoginBox({
  tenant,
  handle,
  date,
  menuId,
}: {
  tenant: { id: string; lineLoginChannelId: string | null; lineLoginChannelSecret: string | null };
  handle: string;
  date: string;
  menuId: string;
}) {
  const tenantId = tenant.id;
  const next = `/book/${handle}?date=${date}&menuId=${menuId}`;

  if (isLineConfigured(tenant)) {
    return (
      <form action={startLineLogin} className="rounded-md bg-neutral-50 p-4 text-center">
        <p className="mb-3 text-sm text-neutral-600">
          ご予約にはLINEでのログインが必要です。
          <br />
          新しく登録する必要はありません。
        </p>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="rounded-md bg-[#06C755] px-5 py-2.5 text-sm font-medium text-white hover:brightness-95"
        >
          LINEでログイン
        </button>
      </form>
    );
  }

  if (isDevFallbackAllowed(tenant)) {
    return (
      <form action={devLogin} className="rounded-md border border-dashed border-amber-400 bg-amber-50 p-4">
        <p className="mb-3 text-xs leading-relaxed text-amber-900">
          <strong>開発用の仮ログインです。</strong>
          LINEの認証情報を設定画面（または{" "}
          <code>LINE_LOGIN_CHANNEL_ID</code> / <code>LINE_LOGIN_CHANNEL_SECRET</code>）に
          設定すると、LINEログインに切り替わります。本番では動きません。
        </p>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="next" value={next} />
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-amber-900">お名前</span>
            <input
              type="text"
              name="name"
              required
              placeholder="山田 花子"
              className="rounded-md border border-amber-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            仮ログイン
          </button>
        </div>
      </form>
    );
  }

  return (
    <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
      ただいまネット予約を受け付けていません。
    </p>
  );
}
