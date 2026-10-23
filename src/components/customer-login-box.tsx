import {
  devLogin,
  resetEmailLogin,
  startEmailLogin,
  startLineLogin,
  verifyEmailLogin,
} from "@/lib/customer-actions";
import { resolveCustomerLoginMethods } from "@/lib/email-login";
import { isDevFallbackAllowed } from "@/lib/line";
import { SubmitButton } from "@/components/submit-button";

/**
 * お客様向けページのログイン欄（LINE／メールのワンタイムコード／開発用の仮ログイン）。
 * next はログインしたあとに戻る先（予約画面・イベントの画面）
 */
export function LoginBox({
  tenant,
  next,
  emailPending,
  showCodeStep,
  purpose = "ご予約",
}: {
  /** 「○○にはLINEでのログインが必要です」の○○ */
  purpose?: string;
  tenant: {
    id: string;
    lineLoginChannelId: string | null;
    lineLoginChannelSecret: string | null;
    customerLoginMethod: string | null;
  };
  next: string;
  emailPending: { tenantId: string; email: string; name: string } | null;
  showCodeStep: boolean;
}) {
  const tenantId = tenant.id;
  const methods = resolveCustomerLoginMethods(tenant);

  // メールでコードを送った直後：コード入力を待つ
  if (methods.email && emailPending && showCodeStep) {
    return (
      <div className="space-y-3">
        <form action={verifyEmailLogin} className="rounded-md bg-neutral-50 p-4 text-center">
          <p className="mb-3 text-sm text-neutral-600">
            <strong>{emailPending.email}</strong> 宛に確認コードを送りました。
            <br />
            10分以内に、届いた6桁のコードを入力してください。
          </p>
          <input type="hidden" name="tenantId" value={tenantId} />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <input
              type="text"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              placeholder="123456"
              className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-center text-lg tracking-[0.3em] focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />
            <SubmitButton
              pendingText="確認しています…"
              className="rounded-md bg-[var(--brand)] px-5 py-1.5 text-sm font-medium text-[var(--brand-on)] hover:bg-[var(--brand-hover)]"
            >
              ログイン
            </SubmitButton>
          </div>
        </form>
        <form action={resetEmailLogin} className="text-center">
          <input type="hidden" name="tenantId" value={tenantId} />
          <button
            type="submit"
            className="text-xs text-neutral-500 underline hover:text-[var(--brand)]"
          >
            メールアドレスを入力し直す
          </button>
        </form>
      </div>
    );
  }

  const showDevFallback = !methods.line && !methods.email && isDevFallbackAllowed(tenant);

  if (!methods.line && !methods.email && !showDevFallback) {
    return (
      <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
        ただいまネット予約を受け付けていません。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {methods.line && (
        <form action={startLineLogin} className="rounded-md bg-neutral-50 p-4 text-center">
          <p className="mb-3 text-sm text-neutral-600">
            {purpose}にはLINEでのログインが必要です。
            <br />
            新しく登録する必要はありません。
          </p>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="rounded-md bg-[#06C755] px-5 py-2.5 text-sm font-medium text-white hover:brightness-95"
          >
            LINEでログイン
          </button>
        </form>
      )}

      {methods.email && (
        <form action={startEmailLogin} className="rounded-md border border-neutral-200 bg-white p-4">
          <p className="mb-3 text-sm text-neutral-600">
            {methods.line
              ? "LINEをお使いでない方は、メールアドレスでもログインできます。"
              : "メールアドレスでログインします。新しく登録する必要はありません。"}
          </p>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">お名前</span>
              <input
                type="text"
                name="name"
                required
                placeholder="山田 花子"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">
                メールアドレス
              </span>
              <input
                type="email"
                name="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
              />
            </label>
            <SubmitButton
              pendingText="送信しています…"
              className="self-end rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-on)] hover:bg-[var(--brand-hover)]"
            >
              コードを送る
            </SubmitButton>
          </div>
        </form>
      )}

      {showDevFallback && (
        <form action={devLogin} className="rounded-md border border-dashed border-amber-400 bg-amber-50 p-4">
          <p className="mb-3 text-xs leading-relaxed text-amber-900">
            <strong>開発用の仮ログインです。</strong>
            LINEの認証情報を設定画面（または{" "}
            <code>LINE_LOGIN_CHANNEL_ID</code> / <code>LINE_LOGIN_CHANNEL_SECRET</code>）に、
            もしくはメール送信（<code>RESEND_API_KEY</code>）を設定すると切り替わります。
            本番では動きません。
          </p>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="next" value={next} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-amber-900">お名前</span>
              <input
                type="text"
                name="name"
                required
                placeholder="山田 花子"
                className="rounded-md border border-amber-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              仮ログイン
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
