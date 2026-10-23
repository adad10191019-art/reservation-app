import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { chooseStaffNotify } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { isLineConfigured } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/schedule";

type NotifyChoice = "email" | "line" | "none";

export default async function NotifySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);

  const [user, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } }),
    // LINE の利用者IDは部署のLINEチャネルごとに違うので、部署ごとに紐づける
    prisma.membership.findUnique({
      where: { userId_tenantId: { userId: session.userId, tenantId: session.tenantId } },
      select: { lineUserId: true, notifyOff: true },
    }),
  ]);

  const linked = Boolean(membership?.lineUserId);
  const lineReady = isLineConfigured(tenant);
  const current: NotifyChoice = membership?.notifyOff ? "none" : linked ? "line" : "email";

  const choices: { value: NotifyChoice; label: string; note: string; disabled?: boolean }[] = [
    {
      value: "email",
      label: "メールで受け取る",
      note: `ログインに使うメール（${user?.email ?? ""}）に届きます。LINE の通数を使いません。`,
    },
    {
      value: "line",
      label: "LINEで受け取る",
      note: lineReady
        ? "公式アカウントからLINEに届きます。1通ごとに公式アカウントの月の通数を使います。"
        : "LINEログインの設定がまだのため、選べません。",
      disabled: !lineReady,
    },
    {
      value: "none",
      label: "受け取らない",
      note: "予約を受けないオーナーなど、知らせが要らない人向けです。",
    },
  ];

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
        <h2 className="mb-1 font-semibold">予約の知らせの受け取り方</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          お客様がネット予約したときと、キャンセルしたときに、
          お知らせが届きます。カレンダーを開かなくても気づけるようになります。
          この部署の分だけの設定です。
        </p>

        {!membership ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            この部署の担当になっていないため、この部署の通知は届きません。
          </p>
        ) : (
          <ul className="space-y-2">
            {choices.map((c) => {
              const selected = c.value === current;
              return (
                <li key={c.value}>
                  <form action={chooseStaffNotify}>
                    <input type="hidden" name="choice" value={c.value} />
                    <button
                      type="submit"
                      disabled={selected || c.disabled}
                      aria-pressed={selected}
                      className={`w-full rounded-md border px-3 py-2.5 text-left text-sm ${
                        selected
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : c.disabled
                            ? "border-neutral-200 bg-neutral-50 text-neutral-400"
                            : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
                      }`}
                    >
                      <span className="font-medium">
                        {selected ? "● " : "○ "}
                        {c.label}
                        {selected && <span className="ml-2 text-xs font-normal">（今の設定）</span>}
                      </span>
                      {c.note && <span className="mt-0.5 block pl-4 text-xs opacity-75">{c.note}</span>}
                      {c.value === "line" && !selected && !linked && lineReady && (
                        <span className="mt-0.5 block pl-4 text-xs opacity-75">
                          押すと LINE の画面に移って紐づけます。
                        </span>
                      )}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-600">
        <h3 className="mb-2 font-medium text-neutral-800">届く条件</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            LINEで受け取るときは、<strong>公式アカウントを友だち追加していること。</strong>
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
