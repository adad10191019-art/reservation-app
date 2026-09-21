import { Banner } from "@/components/banner";
import { requireOwner } from "@/lib/auth";
import { getTenant } from "@/lib/schedule";
import { SLOT_CHOICES } from "@/lib/constants";
import { saveStore } from "@/lib/settings-actions";

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
