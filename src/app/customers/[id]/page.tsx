import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { requireSession } from "@/lib/auth";
import { STATUS_LABEL, type ReservationStatus } from "@/lib/booking";
import { getTenant } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { formatDateLabel, toHm } from "@/lib/time";

const STATUS_STYLE: Record<ReservationStatus, string> = {
  booked: "border-sky-300 bg-sky-50 text-sky-800",
  done: "border-emerald-300 bg-emerald-50 text-emerald-800",
  canceled: "border-neutral-300 bg-neutral-100 text-neutral-600",
  no_show: "border-amber-300 bg-amber-50 text-amber-800",
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);

  // tenantId を必ず条件に入れる
  const customer = await prisma.customer.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!customer) notFound();

  const reservations = await prisma.reservation.findMany({
    where: { customerId: customer.id, tenantId: session.tenantId },
    include: { staff: true },
    orderBy: [{ date: "desc" }, { startMinutes: "desc" }],
  });

  const visitCount = reservations.filter((r) => r.status === "done").length;
  const totalSpent = reservations
    .filter((r) => r.status === "done")
    .reduce((sum, r) => sum + r.priceSnapshot, 0);

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="お客様の詳細" session={session}>
        <Link
          href="/customers"
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          顧客一覧へ
        </Link>
      </AppHeader>

      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">{customer.name} 様</h2>
          {customer.lineUserId && !customer.lineUserId.startsWith("dev:") && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
              LINE連携
            </span>
          )}
        </div>

        <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-neutral-500">電話番号</dt>
          <dd>{customer.phone || <span className="text-neutral-300">未登録</span>}</dd>

          <dt className="text-neutral-500">メール</dt>
          <dd>{customer.email || <span className="text-neutral-300">未登録</span>}</dd>

          <dt className="text-neutral-500">来店回数</dt>
          <dd className="tabular-nums">{visitCount}回</dd>

          <dt className="text-neutral-500">累計のご利用額</dt>
          <dd className="tabular-nums">{totalSpent.toLocaleString()}円</dd>

          {customer.note && (
            <>
              <dt className="text-neutral-500">メモ</dt>
              <dd className="whitespace-pre-wrap">{customer.note}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 font-medium">来店履歴</h3>

        {reservations.length === 0 ? (
          <p className="text-sm text-neutral-500">まだ予約がありません。</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {reservations.map((r) => (
              <li key={r.id} className="py-2.5">
                <Link
                  href={`/reservations/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 hover:bg-neutral-50"
                >
                  <div>
                    <div className="tabular-nums text-sm font-medium">
                      {formatDateLabel(r.date)} {toHm(r.startMinutes)}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {r.menuNameSnapshot} ／ {r.staff.name} ／{" "}
                      {r.priceSnapshot.toLocaleString()}円
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[r.status as ReservationStatus]
                    }`}
                  >
                    {STATUS_LABEL[r.status as ReservationStatus]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
