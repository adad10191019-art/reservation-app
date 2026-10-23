import Link from "next/link";
import { Banner } from "@/components/banner";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tenantHandle } from "@/lib/tenant";
import { formatDateLabel, toHm, todayString } from "@/lib/time";
import { EventForm } from "./event-form";

export default async function EventSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOwner();

  const [tenant, events] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId } }),
    prisma.event.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ date: "desc" }, { startMinutes: "desc" }],
      include: { _count: { select: { entries: { where: { status: "booked" } } } } },
    }),
  ]);

  const today = todayString();
  const upcoming = events.filter((e) => e.date >= today).reverse();
  const past = events.filter((e) => e.date < today);
  const bookUrl = `${process.env.APP_URL?.replace(/\/$/, "") ?? ""}/book/${tenantHandle(tenant)}`;

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">イベントを作る</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          説明会・講演会・セミナーのように、日時と定員を決めて申し込みを受けます。
          受付中のイベントは、お客様の予約ページ（{bookUrl}）の上に並びます。
          申し込みとキャンセルの締め切りは、予約と同じ「開始の何分前まで」（設定→店舗）です。
        </p>
        <EventForm event={null} />
      </section>

      <EventList title="これからのイベント" events={upcoming} empty="まだありません。" />
      {past.length > 0 && <EventList title="終わったイベント" events={past} />}
    </div>
  );
}

function EventList({
  title,
  events,
  empty,
}: {
  title: string;
  events: {
    id: string;
    title: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    capacity: number;
    isOpen: boolean;
    _count: { entries: number };
  }[];
  empty?: string;
}) {
  return (
    <section>
      <h2 className="mb-3 font-semibold">
        {title}（{events.length}件）
      </h2>
      {events.length === 0 ? (
        <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/settings/events/${e.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm hover:bg-neutral-50"
              >
                <span>
                  <span className="font-medium">{e.title}</span>
                  {!e.isOpen && (
                    <span className="ml-2 rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
                      受付停止
                    </span>
                  )}
                  <span className="mt-0.5 block tabular-nums text-neutral-500">
                    {formatDateLabel(e.date)} {toHm(e.startMinutes)}〜{toHm(e.endMinutes)}
                  </span>
                </span>
                <span className="tabular-nums text-neutral-700">
                  申し込み {e._count.entries} ／ {e.capacity}名
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
