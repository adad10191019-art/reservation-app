import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { STATUS_LABEL, type ReservationStatus } from "@/lib/booking";
import { cancelCustomerReservation } from "@/lib/customer-actions";
import { getActiveCustomer } from "@/lib/customer-store";
import { prisma } from "@/lib/prisma";
import { findTenantByHandle, tenantHandle } from "@/lib/tenant";
import { formatDateLabel, toHm, todayString } from "@/lib/time";

export default async function MyReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shop: string }>;
  searchParams: Promise<{ done?: string; canceled?: string; error?: string }>;
}) {
  const { shop } = await params;
  const sp = await searchParams;

  const tenant = await findTenantByHandle(shop);
  if (!tenant) notFound();

  const handle = tenantHandle(tenant);
  const tenantId = tenant.id;

  const session = await getActiveCustomer(tenantId);
  if (!session) redirect(`/book/${handle}`);

  const today = todayString();
  const reservations = await prisma.reservation.findMany({
    where: { tenantId, customerId: session.customerId },
    orderBy: [{ date: "desc" }, { startMinutes: "desc" }],
    include: { staff: true },
    take: 50,
  });

  const upcoming = reservations.filter((r) => r.date >= today && r.status === "booked");
  const past = reservations.filter((r) => !(r.date >= today && r.status === "booked"));

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">ご予約の確認</h1>
          <p className="text-sm text-neutral-500">
            {tenant.name} / {session.name} 様
          </p>
        </div>
        <Link
          href={`/book/${handle}`}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          新しく予約する
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
      {sp.done && (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ご予約を承りました。
        </p>
      )}
      {sp.canceled && (
        <p className="mb-4 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          ご予約をキャンセルしました。
        </p>
      )}

      <section className="mb-6">
        <h2 className="mb-3 font-semibold">これからのご予約（{upcoming.length}件）</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
            ご予約はありません。
          </p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-sky-200 bg-sky-50 p-4"
              >
                <div className="mb-1 font-medium text-sky-900">
                  {formatDateLabel(r.date)} {toHm(r.startMinutes)}
                </div>
                <div className="mb-3 text-sm text-sky-800">
                  {r.menuNameSnapshot}（{r.durationSnapshot}分 /{" "}
                  {r.priceSnapshot.toLocaleString()}円） / 担当：{r.staff.name}
                </div>
                <form action={cancelCustomerReservation}>
                  <input type="hidden" name="tenantId" value={tenantId} />
                  <input type="hidden" name="reservationId" value={r.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    キャンセルする
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">これまでのご予約</h2>
          <ul className="space-y-2">
            {past.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
              >
                <span className="tabular-nums text-neutral-700">
                  {formatDateLabel(r.date)} {toHm(r.startMinutes)}
                </span>
                <span className="text-neutral-600">{r.menuNameSnapshot}</span>
                <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
                  {STATUS_LABEL[r.status as ReservationStatus] ?? r.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs leading-relaxed text-neutral-500">
        お時間が近いご予約は、この画面からのキャンセルができません。
        お手数ですがお電話でご連絡ください。
      </p>
    </main>
  );
}
