/**
 * LINE公式アカウントからのメッセージ送信（Messaging API）。
 *
 * 送れるのは「その公式アカウントを友だち追加している人」だけ。
 * また、LINEログインのチャネルと公式アカウントが同じプロバイダーにないと、
 * 受け取る利用者IDが一致せず送れない。
 *
 * アクセストークンは店舗（Tenant）ごとに持てる。店舗が設定していなければ、
 * 環境変数（LINE_MESSAGING_ACCESS_TOKEN）をシステム全体の既定値として使う。
 * どちらも無い間は、送らずに内容を控えるだけにする。
 * 通知が無くても予約そのものは成立させたいので、失敗しても例外は投げない。
 */

const PUSH_URL = "https://api.line.me/v2/bot/message/push";

export type PushResult =
  | { ok: true; sent: boolean; reason?: string }
  | { ok: false; reason: string };

/** メッセージ送信のアクセストークンを持つテナント。Prisma の Tenant はこれを満たす */
export type TenantMessagingConfig = {
  lineMessagingAccessToken: string | null;
};

function resolveMessagingToken(tenant: TenantMessagingConfig): string | null {
  return tenant.lineMessagingAccessToken || process.env.LINE_MESSAGING_ACCESS_TOKEN || null;
}

export function isMessagingConfigured(tenant: TenantMessagingConfig): boolean {
  return Boolean(resolveMessagingToken(tenant));
}

/**
 * 1人に送る。
 *
 * 送信できなくても予約は成立させたいので、結果を返すだけで例外にはしない。
 */
export async function pushTextMessage(params: {
  tenant: TenantMessagingConfig;
  to: string;
  text: string;
}): Promise<PushResult> {
  const { tenant, to, text } = params;

  if (!to) return { ok: false, reason: "送り先の利用者IDがありません" };

  // 開発用のお客様（仮ログイン）には送らない
  if (to.startsWith("dev:")) {
    console.log(`[LINE通知・未送信（仮ログインの相手）] ${to}\n${text}\n`);
    return { ok: true, sent: false, reason: "仮ログインの相手のため送信しません" };
  }

  const token = resolveMessagingToken(tenant);
  if (!token) {
    console.log(`[LINE通知・未送信（認証情報が未設定）] ${to}\n${text}\n`);
    return { ok: true, sent: false, reason: "LINEの送信アクセストークンが未設定です" };
  }

  try {
    const response = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        reason: `LINEが受け付けませんでした（${response.status}）${detail.slice(0, 200)}`,
      };
    }

    return { ok: true, sent: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "LINEとの通信に失敗しました",
    };
  }
}
