import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { requireOwner } from "@/lib/auth";
import { cancelEntryAsShop, deleteEvent } from "@/lib/event-actions";
import { prisma } from "@/lib/prisma";
import { tenantHandle } from "@/lib/tenant";
import { EventForm } from "../event-form";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireOwner();

  const event = await prisma.event.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      tenant: true,
      entries: { include: { customer: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!event) notFound();

  const booked = event.entries.filter((e) => e.status === "booked");
  const canceled = event.entries.filter((e) => e.status !== "booked");
  const eventUrl = `${process.env.APP_URL?.replace(/\/$/, "") ?? ""}/book/${tenantHandle(event.tenant)}/events/${event.id}`;

  return (
    <div className="space-y-5">
      <p className="text-sm">
        <Link href="/settings/events" className="text-neutral-500 underline hover:text-neutral-800">
          ← イベントの一覧へ
        </Link>
      </p>

      <Banner error={sp.error} done={sp.done} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">お客様に送るURL</h2>
        <p className="mb-2 text-xs text-neutral-500">
          LINE のメッセージやリッチメニューに貼ると、このイベントの申し込み画面が直接開きます。
        </p>
        <p className="break-all rounded-md bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-800">{eventUrl}</p>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">
          申し込んだ人（{booked.length} ／ {event.capacity}名）
        </h2>
        {booked.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
            まだ申し込みはありません。
          </p>
        ) : (
          <ol className="divide-y divide-neutral-100 text-sm">
            {booked.map((entry, i) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="mr-2 tabular-nums text-neutral-400">{i + 1}.</span>
                  <Link href={`/customers/${entry.customer.id}`} className="font-medium hover:underline">
                    {entry.customer.name}
                  </Link>
                  <span className="ml-2 text-xs text-neutral-500">
                    {[entry.customer.phone, entry.customer.email, entry.customer.lineUserId ? "LINE" : null]
                      .filter(Boolean)
                      .join(" ／ ")}
                  </span>
                </span>
                <form action={cancelEntryAsShop}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="entryId" value={entry.id} />
                  <SubmitButton
                    confirmText={`${entry.customer.name} 様の申し込みを取り消しますか？お客様にキャンセルの知らせが届きます。`}
                    pendingText="取り消しています…"
                    className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                  >
                    取り消す
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ol>
        )}
        {canceled.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            キャンセルした人：{canceled.map((e) => e.customer.name).join("、")}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">内容を直す</h2>
        <EventForm event={event} />
      </section>

      <form action={deleteEvent} className="text-right">
        <input type="hidden" name="id" value={event.id} />
        <SubmitButton
          confirmText={`「${event.title}」を削除しますか？`}
          pendingText="削除しています…"
          className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50"
        >
          このイベントを削除する
        </SubmitButton>
        <p className="mt-1 text-xs text-neutral-500">申し込みが1件も無いときだけ削除できます。</p>
      </form>
    </div>
  );
}
