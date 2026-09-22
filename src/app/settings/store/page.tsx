import { Banner } from "@/components/banner";
import { requireOwner } from "@/lib/auth";
import { getTenant } from "@/lib/schedule";
import { SLOT_CHOICES } from "@/lib/constants";
import { saveLineSettings, saveStore } from "@/lib/settings-actions";

export default async function StoreSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOwner();
  const tenant = await getTenant(session.tenantId);

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-4 font-semibold">店舗の基本設定</h2>

        <form action={saveStore} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">店舗名</span>
            <input
              type="text"
              name="name"
              required
              defaultValue={tenant.name}
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              お客様向けURLの短い名前
            </span>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span className="text-neutral-500">/book/</span>
              <input
                type="text"
                name="slug"
                defaultValue={tenant.slug ?? ""}
                placeholder="sample-salon"
                pattern="[a-zA-Z0-9-]*"
                maxLength={40}
                className="w-56 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <span className="mt-1 block text-xs text-neutral-500">
              半角の英小文字・数字・ハイフン。空欄にすると店舗IDのURLに戻ります。
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              予約枠の刻み
            </span>
            <select
              name="slotMinutes"
              defaultValue={String(tenant.slotMinutes)}
              className="w-full max-w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {SLOT_CHOICES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes}分
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            保存する
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">この店舗専用のLINE連携</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          空欄のままなら、システム全体の既定値（環境変数）を使います。
          複数の公式LINEアカウントを店舗ごとに使い分けたいときだけ、ここに入れてください。
        </p>

        <form action={saveLineSettings} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              LINEログイン チャネルID
              <StatusBadge set={Boolean(tenant.lineLoginChannelId)} fallback={Boolean(process.env.LINE_LOGIN_CHANNEL_ID)} />
            </span>
            <input
              type="text"
              name="lineLoginChannelId"
              defaultValue={tenant.lineLoginChannelId ?? ""}
              placeholder="未設定（既定値を使用）"
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              LINEログイン チャネルシークレット
              <StatusBadge set={Boolean(tenant.lineLoginChannelSecret)} fallback={Boolean(process.env.LINE_LOGIN_CHANNEL_SECRET)} />
            </span>
            <input
              type="password"
              name="lineLoginChannelSecret"
              defaultValue={tenant.lineLoginChannelSecret ?? ""}
              placeholder="未設定（既定値を使用）"
              autoComplete="off"
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              公式アカウントの送信用アクセストークン
              <StatusBadge set={Boolean(tenant.lineMessagingAccessToken)} fallback={Boolean(process.env.LINE_MESSAGING_ACCESS_TOKEN)} />
            </span>
            <input
              type="password"
              name="lineMessagingAccessToken"
              defaultValue={tenant.lineMessagingAccessToken ?? ""}
              placeholder="未設定（既定値を使用）"
              autoComplete="off"
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              LINEログインのチャネルと、同じプロバイダーの公式アカウントである必要があります。
              別プロバイダーだと利用者IDが一致せず、通知が届きません。
            </span>
          </label>

          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            保存する
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-2 font-medium">お客様向けの予約ページ</h3>
        <p className="mb-2 break-all rounded-md bg-neutral-50 px-3 py-2 font-mono text-sm">
          /book/{tenant.slug ?? tenant.id}
        </p>
        <p className="text-xs leading-relaxed text-neutral-500">
          このURLをお客様に案内します。短い名前を付けても、
          <strong>それまでに配った店舗IDのURLは使えたまま</strong>です。
        </p>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-600">
        <h3 className="mb-2 font-medium text-neutral-800">予約枠の刻みについて</h3>
        <p className="mb-2">
          予約を開始できる時刻の間隔です。15分にすると
          <code className="mx-1">10:00 / 10:15 / 10:30…</code>
          から選べ、30分にすると
          <code className="mx-1">10:00 / 10:30…</code>
          だけになります。
        </p>
        <p className="mb-2">
          <strong>メニューの所要時間とは別の設定です。</strong>
          60分のメニューでも、刻みが15分なら 10:15 開始で受けられます。
        </p>
        <p>
          刻みを変えても、<strong>すでに入っている予約はそのまま残ります。</strong>
          新しく取る予約だけが、新しい刻みに揃うようになります。
        </p>
      </section>
    </div>
  );
}

/** この項目が「この店舗の設定」「共通の既定値」「未設定」のどれかを一目で示す */
function StatusBadge({ set, fallback }: { set: boolean; fallback: boolean }) {
  if (set) {
    return (
      <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-normal text-sky-800">
        この店舗の設定を使用中
      </span>
    );
  }
  if (fallback) {
    return (
      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-600">
        共通の既定値を使用中
      </span>
    );
  }
  return (
    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">
      未設定
    </span>
  );
}
