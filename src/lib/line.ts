/**
 * LINEログイン。
 *
 * お客様に新規登録をさせずに本人確認をするための仕組み。
 * LINE の画面で許可してもらい、戻ってきたときに利用者IDと名前を受け取る。
 *
 * 認証情報は店舗（Tenant）ごとに持てる。店舗が設定していなければ、
 * 環境変数（LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET）を
 * システム全体の既定値として使う。どちらも無い間は、開発用の仮ログインに
 * 切り替わる。仮ログインは本番では動かない（NODE_ENV で止める）。
 */

const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const PROFILE_URL = "https://api.line.me/v2/profile";

export type LineProfile = {
  /** LINE の利用者ID。店舗をまたいでも同じ人なら同じ値 */
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

/** LINEログインの認証情報を持つテナント。Prisma の Tenant はこれを満たす */
export type TenantLineLoginConfig = {
  lineLoginChannelId: string | null;
  lineLoginChannelSecret: string | null;
};

function resolveLoginCredentials(tenant: TenantLineLoginConfig): {
  channelId: string | null;
  channelSecret: string | null;
} {
  return {
    channelId: tenant.lineLoginChannelId || process.env.LINE_LOGIN_CHANNEL_ID || null,
    channelSecret:
      tenant.lineLoginChannelSecret || process.env.LINE_LOGIN_CHANNEL_SECRET || null,
  };
}

export function isLineConfigured(tenant: TenantLineLoginConfig): boolean {
  const { channelId, channelSecret } = resolveLoginCredentials(tenant);
  return Boolean(channelId && channelSecret);
}

/** 仮ログインを使ってよいか（認証情報が無く、かつ本番でない場合だけ） */
export function isDevFallbackAllowed(tenant: TenantLineLoginConfig): boolean {
  return !isLineConfigured(tenant) && process.env.NODE_ENV !== "production";
}

function callbackUrl(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/book/callback`;
}

/**
 * LINE の許可画面へ送るURLを作る。
 *
 * state は、戻ってきたときに「自分が始めた手続きか」を確かめるための合言葉。
 * 他人に手続きを始めさせる攻撃（CSRF）を防ぐために必ず確認する。
 */
export function buildAuthorizeUrl(
  tenant: TenantLineLoginConfig,
  params: { state: string },
): string {
  const { channelId } = resolveLoginCredentials(tenant);
  if (!channelId) throw new Error("LINE_LOGIN_CHANNEL_ID が設定されていません");

  const query = new URLSearchParams({
    response_type: "code",
    client_id: channelId,
    redirect_uri: callbackUrl(),
    state: params.state,
    scope: "profile openid",
  });
  return `${AUTHORIZE_URL}?${query.toString()}`;
}

/** 認可コードを使って、利用者の情報を受け取る */
export async function fetchLineProfile(
  tenant: TenantLineLoginConfig,
  code: string,
): Promise<LineProfile> {
  const { channelId, channelSecret } = resolveLoginCredentials(tenant);
  if (!channelId || !channelSecret) {
    throw new Error("LINEの認証情報が設定されていません");
  }

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(),
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("LINEとのやり取りに失敗しました（トークンの取得）");
  }

  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("LINEからトークンを受け取れませんでした");

  const profileResponse = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) {
    throw new Error("LINEとのやり取りに失敗しました（プロフィールの取得）");
  }

  const profile = (await profileResponse.json()) as Partial<LineProfile>;
  if (!profile.userId) throw new Error("LINEから利用者IDを受け取れませんでした");

  return {
    userId: profile.userId,
    displayName: profile.displayName ?? "LINEユーザー",
    pictureUrl: profile.pictureUrl,
  };
}
