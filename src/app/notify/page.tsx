import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { startStaffLineLink, unlinkStaffLine } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { isLineConfigured } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/schedule";

export default async function NotifySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);

  const user = await prisma.user.findFirst({
    where: { id: session.userId, tenantId: session.tenantId },
    select: { email: true, lineUserId: true, role: true },
  });

  const linked = Boolean(user?.lineUserId);

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="通知の受け取り" session={session}>
        <Link
          href="/calendar"
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          カレンダーへ
        </Link>
      </AppHeader>

      <Banner error={sp.error} done={sp.done} />

      <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">LINEで通知を受け取る</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          お客様がネット予約したときと、キャンセルしたときに、
          あなたのLINEへお知らせが届きます。
          カレンダーを開かなくても気づけるようになります。
        </p>

        <div
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            linked
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-neutral-200 bg-neutral-50 text-neutral-600"
          }`}
        >
          {linked ? "受け取る設定になっています" : "まだ受け取る設定になっていません"}
          <span className="ml-2 text-xs opacity-70">（{user?.email}）</span>
        </div>

        {!isLineConfigured() ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            LINEログインの設定がまだのため、紐づけできません。
          </p>
        ) : linked ? (
          <form action={unlinkStaffLine}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              受け取りを解除する
            </button>
          </form>
        ) : (
          <form action={startStaffLineLink}>
            <button
              type="submit"
              className="rounded-md bg-[#06C755] px-5 py-2.5 text-sm font-medium text-white hover:brightness-95"
            >
              LINEを紐づける
            </button>
          </form>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-600">
        <h3 className="mb-2 font-medium text-neutral-800">届く条件</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>公式アカウントを友だち追加していること。</strong>
            未追加だと、紐づけても届きません。
          </li>
          <li>
            <strong>オーナー</strong>には、その店舗のネット予約がすべて届きます。
          </li>
          <li>
            <strong>スタッフ</strong>には、自分が担当する予約だけ届きます。
          </li>
          <li>
            店舗側の画面から入れた予約では届きません（ご自分で入力したものなので）。
          </li>
        </ul>
      </section>
    </main>
  );
}
