import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findAvailability } from "@/lib/availability";
import { filterBookableStarts } from "@/lib/booking-window";
import { createCustomerReservation } from "@/lib/customer-actions";
import { NAME_MAX_LENGTH } from "@/lib/customer-profile";
import { getActiveCustomer } from "@/lib/customer-store";
import { priceLabel } from "@/lib/price";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/submit-button";
import { findTenantByHandle, tenantHandle } from "@/lib/tenant";
import { formatDateLabel, sanitizeDate, toHm } from "@/lib/time";

export default async function BookingConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ shop: string }>;
  searchParams: Promise<{ date?: string; menuId?: string; slot?: string; error?: string }>;
}) {
  const { shop } = await params;
  const sp = await searchParams;

  const tenant = await findTenantByHandle(shop);
  if (!tenant) notFound();

  const handle = tenantHandle(tenant);
  const tenantId = tenant.id;

  const back: (message: string) => never = (message) =>
    redirect(
      `/book/${handle}?date=${sp.date ?? ""}&menuId=${sp.menuId ?? ""}&error=${encodeURIComponent(message)}`,
    );

  const session = await getActiveCustomer(tenantId);
  if (!session) redirect(`/book/${handle}`);

  const date = sanitizeDate(sp.date);
  const menu = sp.menuId
    ? await prisma.menu.findFirst({ where: { id: sp.menuId, tenantId, isActive: true } })
    : null;
  if (!menu) back("メニューを選び直してください");

  const [startText, staffId] = (sp.slot ?? "").split("|");
  const startMinutes = Number(startText);
  if (!Number.isInteger(startMinutes) || !staffId) back("時間を選び直してください");

  const staff = await prisma.staff.findFirst({
    where: { id: staffId, tenantId, isActive: true },
  });
  if (!staff) back("担当者を選び直してください");

  // ここでもう一度、他の人に取られていないか・受付時間内かを確かめる
  // （選択画面を開いてから確定するまでの間に埋まる可能性があるため）
  const availability = await findAvailability({ tenantId, date, menuId: menu!.id, staffId });
  const bookableStarts = new Set(
    filterBookableStarts(availability.perStaff[0]?.starts ?? [], {
      date,
      windowDays: tenant.bookingWindowDays,
      leadMinutes: tenant.bookingLeadMinutes,
    }),
  );
  if (!bookableStarts.has(startMinutes)) {
    back("その時間はご予約いただけなくなりました。お手数ですが選び直してください");
  }

  const selectQuery = `date=${date}&menuId=${menu!.id}`;

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">ご予約内容の確認</h1>
        <p className="text-sm text-neutral-500">{tenant.name}</p>
      </header>

      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">日時</dt>
            <dd className="font-medium tabular-nums">
              {formatDateLabel(date)} {toHm(startMinutes)}〜
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">メニュー</dt>
            <dd className="font-medium">{menu!.name}（{menu!.durationMinutes}分）</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">担当</dt>
            <dd className="font-medium">{staff!.name}</dd>
          </div>
          {priceLabel(menu!.price) && (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">料金</dt>
              <dd className="font-medium">{priceLabel(menu!.price)}</dd>
            </div>
          )}
        </dl>
      </section>

      {sp.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</p>
      )}

      <form action={createCustomerReservation} className="space-y-3">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="menuId" value={menu!.id} />
        <input type="hidden" name="slot" value={`${startMinutes}|${staffId}`} />

        <section className="mb-5 space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold">ご予約者の情報</h2>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              お名前（フルネーム）<span className="ml-1 text-red-600">必須</span>
            </span>
            <input
              type="text"
              name="name"
              required
              maxLength={NAME_MAX_LENGTH}
              autoComplete="name"
              // 初めての方（LINEの表示名のままの方）は空欄から入力してもらう
              defaultValue={session.nameEntered ? session.name : ""}
              placeholder="山田 花子"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              電話番号<span className="ml-1 text-neutral-400">（任意）</span>
            </span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              inputMode="tel"
              maxLength={20}
              defaultValue={session.phone ?? ""}
              placeholder="090-1234-5678"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              当日の急なご連絡にだけ使います。
            </span>
          </label>
          <p className="text-xs text-neutral-500">
            入力した情報の取り扱いは
            <Link href="/legal/privacy" className="mx-0.5 text-sky-700 underline">
              プライバシーポリシー
            </Link>
            をご覧ください。
          </p>
        </section>

        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          内容に間違いがなければ「この内容で予約する」を押してください。
        </p>

        <SubmitButton
          pendingText="予約しています…"
          className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700"
        >
          この内容で予約する
        </SubmitButton>

        <Link
          href={`/book/${handle}?${selectQuery}`}
          className="block w-full rounded-md border border-neutral-300 px-4 py-2.5 text-center text-sm text-neutral-700 hover:bg-neutral-50"
        >
          時間を選び直す
        </Link>
      </form>
    </main>
  );
}
