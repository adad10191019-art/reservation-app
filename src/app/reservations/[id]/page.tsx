import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import { changeReservationStatus, moveReservation } from "@/lib/actions";
import { findAvailability } from "@/lib/availability";
import { STATUS_LABEL, type ReservationStatus } from "@/lib/booking";
import { canManageStaffReservation, denyMessage } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/schedule";
import { formatDateLabel, sanitizeDate, toHm } from "@/lib/time";

const STATUS_STYLE: Record<ReservationStatus, string> = {
  booked: "border-sky-300 bg-sky-50 text-sky-800",
  done: "border-emerald-300 bg-emerald-50 text-emerald-800",
  canceled: "border-neutral-300 bg-neutral-100 text-neutral-600",
  no_show: "border-amber-300 bg-amber-50 text-amber-800",
};

export default async function ReservationDetailPage({
  params,
  searchParams,
}: {
  // Next.js 16 では params も searchParams も Promise
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; error?: string; done?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession();

  // 互いに依存しないDB読み取りは同時に投げる。
  // 1件ずつ待つと、DBとの往復（Neonは特に）がそのまま合計時間になって
  // 詳細画面を開くたびに待たされる原因になる。
  const [tenant, reservation, staffList] = await Promise.all([
    getTenant(session.tenantId),
    prisma.reservation.findFirst({
      // tenantId を必ず条件に入れる
      where: { id, tenantId: session.tenantId },
      include: { customer: true, staff: true },
    }),
    prisma.staff.findMany({ where: { tenantId: session.tenantId } }),
  ]);
  if (!reservation) notFound();

  const status = reservation.status as ReservationStatus;
  const isBooked = status === "booked";

  // 変更先を探す日付。指定がなければ今の予約日
  const targetDate = sanitizeDate(sp.date ?? reservation.date);

  // 自分自身は枠を塞ぐ対象から外す
  const availability = isBooked
    ? await findAvailability({
        tenantId: tenant.id,
        date: targetDate,
        menuId: reservation.menuId,
        excludeReservationId: reservation.id,
      })
    : null;

  const staffNames = new Map(staffList.map((s) => [s.id, s.name]));

  // スタッフは自分の担当分しか操作できない
  const canManage = canManageStaffReservation(session, reservation.staffId);
  // 付け替え先も自分に限る（オーナーは制限なし）
  const selectableSlots = (availability?.merged ?? []).filter((slot) =>
    session.role === "owner" || session.role === "group_admin"
      ? true
      : !!session.staffId && slot.staffIds.includes(session.staffId),
  );

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="予約の詳細" session={session}>
        <Link
          href={`/calendar?date=${reservation.date}`}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          カレンダーへ
        </Link>
      </AppHeader>

      {sp.error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {sp.error}
        </p>
      )}
      {sp.done && !sp.error && (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          変更しました。
        </p>
      )}

      {/* 内容 */}
      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{reservation.menuNameSnapshot}</h2>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>

        <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-neutral-500">日時</dt>
          <dd className="tabular-nums">
            {formatDateLabel(reservation.date)}{" "}
            {toHm(reservation.startMinutes)}–{toHm(reservation.endMinutes)}
          </dd>

          <dt className="text-neutral-500">担当</dt>
          <dd>{reservation.staff.name}</dd>

          <dt className="text-neutral-500">お客様</dt>
          <dd>
            <Link href={`/customers/${reservation.customer.id}`} className="text-sky-700 hover:underline">
              {reservation.customer.name} 様
            </Link>
            {reservation.customer.phone && (
              <span className="ml-2 text-neutral-500">{reservation.customer.phone}</span>
            )}
          </dd>

          <dt className="text-neutral-500">所要時間</dt>
          <dd className="tabular-nums">
            {reservation.durationSnapshot}分
            <span className="ml-2 text-xs text-neutral-500">
              （枠は片付けを含め {reservation.endMinutes - reservation.startMinutes}分）
            </span>
          </dd>

          <dt className="text-neutral-500">料金</dt>
          <dd className="tabular-nums">{reservation.priceSnapshot.toLocaleString()}円</dd>
        </dl>

        <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          メニュー名・所要時間・料金は<strong>予約した時点の値</strong>です。
          あとでメニュー設定を変えても、この予約の内容は変わりません。
        </p>
      </section>

      {!canManage && (
        <p className="mb-5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          {denyMessage(session)}。内容の閲覧のみできます。
        </p>
      )}

      {/* 状態の変更 */}
      {canManage && (
      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">状態を変える</h2>
        <form action={changeReservationStatus} className="flex flex-wrap gap-2">
          <input type="hidden" name="reservationId" value={reservation.id} />
          <input type="hidden" name="date" value={reservation.date} />

          {isBooked ? (
            <>
              <StatusButton status="done" label="来店済みにする" tone="emerald" />
              <StatusButton status="no_show" label="無断キャンセル" tone="amber" />
              <StatusButton status="canceled" label="キャンセルする" tone="red" />
            </>
          ) : (
            <StatusButton status="booked" label="予約済みに戻す" tone="sky" />
          )}
        </form>
        {!isBooked && (
          <p className="mt-2 text-xs text-neutral-500">
            戻すときは、その間に別の予約が入っていないかを確認します。
          </p>
        )}
      </section>
      )}

      {/* 日時・担当の変更 */}
      {canManage && isBooked && (
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">日時・担当を変える</h2>

          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                変更先の日付
              </span>
              <input
                type="date"
                name="date"
                defaultValue={targetDate}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              空きを見る
            </button>
          </form>

          {selectableSlots.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
              {formatDateLabel(targetDate)} に空きはありません。
            </p>
          ) : (
            <form action={moveReservation} className="space-y-4">
              <input type="hidden" name="reservationId" value={reservation.id} />
              <input type="hidden" name="date" value={targetDate} />

              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  {formatDateLabel(targetDate)} の空き（{selectableSlots.length}枠）
                </legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {selectableSlots.map((slot) => {
                    // 今の担当が対応できるならそのまま、無理なら先頭のスタッフ
                    const assignedStaffId = slot.staffIds.includes(reservation.staffId)
                      ? reservation.staffId
                      : slot.staffIds[0];
                    const isCurrent =
                      targetDate === reservation.date &&
                      slot.startMinutes === reservation.startMinutes &&
                      assignedStaffId === reservation.staffId;

                    return (
                      <label
                        key={slot.startMinutes}
                        className={`cursor-pointer rounded-md border px-2 py-2 text-center text-sm hover:bg-neutral-50 has-checked:border-sky-500 has-checked:bg-sky-50 has-checked:text-sky-900 ${
                          isCurrent ? "border-neutral-400 bg-neutral-100" : "border-neutral-300"
                        }`}
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
                        <span className="block text-xs text-neutral-500">
                          {isCurrent ? "現在" : staffNames.get(assignedStaffId)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <button
                type="submit"
                className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 sm:w-auto"
              >
                この時間に変更する
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}

function StatusButton({
  status,
  label,
  tone,
}: {
  status: ReservationStatus;
  label: string;
  tone: "emerald" | "amber" | "red" | "sky";
}) {
  const styles: Record<typeof tone, string> = {
    emerald: "border-emerald-300 text-emerald-800 hover:bg-emerald-50",
    amber: "border-amber-300 text-amber-800 hover:bg-amber-50",
    red: "border-red-300 text-red-800 hover:bg-red-50",
    sky: "border-sky-300 text-sky-800 hover:bg-sky-50",
  };
  return (
    <button
      type="submit"
      name="status"
      value={status}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium ${styles[tone]}`}
    >
      {label}
    </button>
  );
}
