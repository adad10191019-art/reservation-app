import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { resolveBrandPalette } from "@/lib/brand-color";
import { applyToEventAction } from "@/lib/customer-actions";
import { NAME_MAX_LENGTH } from "@/lib/customer-profile";
import { getActiveCustomer, getEmailLoginPending } from "@/lib/customer-store";
import { listOpenEvents } from "@/lib/event-list";
import { resolveLiffId } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { LiffAutoLogin } from "@/components/liff-auto-login";
import { LoginBox } from "@/components/customer-login-box";
import { SubmitButton } from "@/components/submit-button";
import { findTenantByHandle, tenantHandle } from "@/lib/tenant";
import { formatDateLabel, toHm } from "@/lib/time";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ shop: string; id: string }>;
  searchParams: Promise<{ error?: string; emailStep?: string }>;
}) {
  const { shop, id } = await params;
  const sp = await searchParams;

  const tenant = await findTenantByHandle(shop);
  if (!tenant) notFound();

  const handle = tenantHandle(tenant);
  const tenantId = tenant.id;
  const brand = resolveBrandPalette(tenant.brandColor);
  const liffId = resolveLiffId(tenant);

  // 受付中で締め切り前のものだけ出す（終わったイベントのURLを開いても申し込めない）
  const event = (await listOpenEvents(tenantId, tenant.bookingLeadMinutes)).find((e) => e.id === id);
  const session = await getActiveCustomer(tenantId);
  const myEntry =
    event && session
      ? await prisma.eventEntry.findUnique({
          where: { eventId_customerId: { eventId: event.id, customerId: session.customerId } },
          select: { status: true },
        })
      : null;
  const alreadyEntered = myEntry?.status === "booked";

  const brandVars = {
    "--brand": brand.base,
    "--brand-hover": brand.hover,
    "--brand-tint": brand.tint,
    "--brand-on": brand.onBase,
  } as CSSProperties;

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6" style={brandVars}>
      <header className="mb-6 border-b border-neutral-200 pb-4">
        <p className="text-xs font-medium tracking-[0.2em] text-[var(--brand)]">EVENT</p>
        <p className="text-sm text-neutral-500">{tenant.name}</p>
      </header>

      {sp.error && (
        <p role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {sp.error}
        </p>
      )}

      {!event ? (
        <p className="rounded-lg bg-neutral-50 px-3 py-8 text-center text-sm text-neutral-500">
          このイベントは受付を終了しました。
        </p>
      ) : (
        <>
          <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-5">
            <h1 className="font-heading mb-3 text-xl font-semibold text-neutral-900">{event.title}</h1>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-4">
                <dt className="w-12 shrink-0 text-neutral-500">日時</dt>
                <dd className="font-medium tabular-nums">
                  {formatDateLabel(event.date)} {toHm(event.startMinutes)}〜{toHm(event.endMinutes)}
                </dd>
              </div>
              {event.venue && (
                <div className="flex gap-4">
                  <dt className="w-12 shrink-0 text-neutral-500">会場</dt>
                  <dd className="font-medium">{event.venue}</dd>
                </div>
              )}
              <div className="flex gap-4">
                <dt className="w-12 shrink-0 text-neutral-500">定員</dt>
                <dd>
                  {event.capacity}名
                  <span className={`ml-2 text-xs ${event.remaining > 0 ? "text-emerald-700" : "text-neutral-400"}`}>
                    {event.remaining > 0 ? `残り${event.remaining}席` : "満席"}
                  </span>
                </dd>
              </div>
            </dl>
            {event.description && (
              <p className="mt-4 whitespace-pre-wrap border-t border-neutral-100 pt-4 text-sm leading-relaxed text-neutral-700">
                {event.description}
              </p>
            )}
          </section>

          {alreadyEntered ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              お申し込み済みです。
              <Link href={`/book/${handle}/mine`} className="ml-1 underline">
                お申し込みの確認・キャンセル
              </Link>
            </p>
          ) : event.remaining === 0 ? (
            <p className="rounded-md bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
              満席のため、受付を終了しました。
            </p>
          ) : session ? (
            <form action={applyToEventAction} className="space-y-4">
              <input type="hidden" name="tenantId" value={tenantId} />
              <input type="hidden" name="eventId" value={event.id} />

              <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
                <h2 className="text-sm font-semibold">お申し込みの情報</h2>
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
                    defaultValue={session.nameEntered ? session.name : ""}
                    placeholder="山田 花子"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
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
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  />
                  <span className="mt-1 block text-xs text-neutral-500">当日の急なご連絡にだけ使います。</span>
                </label>
                <p className="text-xs text-neutral-500">
                  入力した情報の取り扱いは
                  <Link href="/legal/privacy" className="mx-0.5 underline">
                    プライバシーポリシー
                  </Link>
                  をご覧ください。
                </p>
              </section>

              <SubmitButton
                pendingText="申し込んでいます…"
                className="w-full rounded-md bg-[var(--brand)] px-4 py-3 text-sm font-medium text-[var(--brand-on)] transition hover:bg-[var(--brand-hover)]"
              >
                この内容で申し込む
              </SubmitButton>
            </form>
          ) : (
            <>
              {liffId && <LiffAutoLogin tenantId={tenantId} liffId={liffId} />}
              <LoginBox
                purpose="お申し込み"
                tenant={tenant}
                next={`/book/${handle}/events/${event.id}`}
                emailPending={await getEmailLoginPending(tenantId)}
                showCodeStep={sp.emailStep === "code"}
              />
            </>
          )}
        </>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href={`/book/${handle}`} className="text-neutral-500 underline hover:text-[var(--brand)]">
          {tenant.name} の予約ページへ
        </Link>
      </p>
    </main>
  );
}
