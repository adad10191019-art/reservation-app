/**
 * Googleカレンダーとの双方向連携。
 *
 * アプリ→カレンダーは calendarToken によるURL購読（ics.ts）が別にあるので、
 * ここが担うのはカレンダー→アプリの向き（本人のGoogleカレンダーにある予定を
 * 「空いていない時間」として取り込み、全体スケジュールにも出す）だけ。
 *
 * 連携は人（社員名簿）に付く。本人が自分のGoogleアカウントで許可し、以後はリフレッシュトークンで
 * 裏側からアクセストークンを取り直し続ける（LINEログインと同じ、fetchだけの実装）。
 */
import { prisma } from "./prisma";
import { dateMinutesToUtcIso } from "./time";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function callbackUrl(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/google-calendar/callback`;
}

/** 許可画面へ送るURLを作る。state は戻ってきたときの本人確認（CSRF対策）に使う */
export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID が設定されていません");

  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(),
    response_type: "code",
    // リフレッシュトークンを毎回必ずもらうための指定
    access_type: "offline",
    prompt: "consent",
    // 画面に表示する連携先メールアドレスの取得のため、email も一緒に求める
    scope: "https://www.googleapis.com/auth/calendar.readonly email",
    state,
  });
  return `${AUTHORIZE_URL}?${query.toString()}`;
}

/** 認可コードを、リフレッシュトークン等と交換する */
export async function exchangeCodeForTokens(
  code: string,
): Promise<{ refreshToken: string; accessToken: string; expiresIn: number; email: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Googleの認証情報が設定されていません");

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error("Googleとのやり取りに失敗しました（トークンの取得）");

  const token = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!token.access_token || !token.refresh_token) {
    // すでに連携済みの状態で連携し直そうとすると refresh_token が来ないことがある。
    // 呼び出し側で「一度連携解除してからやり直してください」と案内する
    throw new Error(
      "Googleから連携情報を受け取れませんでした。一度連携を解除してから、もう一度お試しください",
    );
  }

  const userRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const user = userRes.ok ? ((await userRes.json()) as { email?: string }) : {};

  return {
    refreshToken: token.refresh_token,
    accessToken: token.access_token,
    expiresIn: token.expires_in ?? 3600,
    email: user.email ?? "不明なアカウント",
  };
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Googleの認証情報が設定されていません");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Googleカレンダーとの連携が切れています。再連携してください");

  const token = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!token.access_token) throw new Error("Googleからトークンを受け取れませんでした");
  return { accessToken: token.access_token, expiresIn: token.expires_in ?? 3600 };
}

/**
 * Googleに、以後このリフレッシュトークンを使わせないよう伝える。
 *
 * テナント解約などでこちらのDBから連携情報を消すときに合わせて呼ぶ。
 * 失敗しても（すでに失効済み、Google側が一時的に不調、など）呼び出し側の
 * 処理は止めない。DB上の削除さえ済めば、このアプリからは二度と使われない。
 */
export async function revokeGoogleToken(refreshToken: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    // 失敗しても致命的ではないので握りつぶす（呼び出し側はログのみ残す）
  }
}

/**
 * その人の連携を外す（外すボタン・退職・登録の取り消しで使う）。
 * DB から消し、全体スケジュール用の控えも捨て、Google にも以後読ませないよう伝える。
 */
export async function removeGoogleConnection(employeeId: string): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { employeeId } });
  if (!connection) return;
  await prisma.googleCalendarConnection.deleteMany({ where: { employeeId } });
  await prisma.googleEventCache.deleteMany({ where: { employeeId } });
  await revokeGoogleToken(connection.refreshToken);
}

type ConnectionRow = {
  employeeId: string;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
};

/** 有効なアクセストークンを返す。期限切れならリフレッシュしてDBに保存し直す */
async function getValidAccessToken(connection: ConnectionRow): Promise<string> {
  const stillValid =
    connection.accessToken &&
    connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
  if (stillValid) return connection.accessToken as string;

  const { accessToken, expiresIn } = await refreshAccessToken(connection.refreshToken);
  await prisma.googleCalendarConnection.update({
    where: { employeeId: connection.employeeId },
    data: { accessToken, accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000) },
  });
  return accessToken;
}

/**
 * 指定した日付ぶんの、Googleカレンダー上で予定が入っている時間帯を取ってくる
 * （日付ごとの「0時からの経過分」に直して返す）。
 *
 * 対象の日付をまとめて1回のAPI呼び出しで済ませる（1日ごとに呼ぶとスタッフ数×日数
 * ぶんGoogleへ問い合わせることになり、週の空き状況を見るだけで大量の通信が発生するため）。
 *
 * Google側に問い合わせられなかった場合は「取り込めなかった」だけとして扱い、
 * 予約の受付自体は止めない（空でないカレンダーを空と見なす方が安全なので、
 * 失敗時は busy=なし として返す）。
 */
export async function fetchGoogleBusyByDate(
  connection: ConnectionRow,
  dates: string[],
): Promise<Map<string, { start: number; end: number }[]>> {
  const result = new Map<string, { start: number; end: number }[]>(dates.map((d) => [d, []]));
  if (dates.length === 0) return result;

  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(connection);
  } catch {
    return result;
  }

  let res: Response;
  try {
    res = await fetch(FREEBUSY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: dateMinutesToUtcIso(first, 0),
        timeMax: dateMinutesToUtcIso(last, 24 * 60),
        items: [{ id: "primary" }],
      }),
    });
  } catch {
    return result;
  }
  if (!res.ok) return result;

  const data = (await res.json()) as {
    calendars?: { primary?: { busy?: { start: string; end: string }[] } };
  };
  const busy = data.calendars?.primary?.busy ?? [];

  for (const b of busy) {
    const startMs = new Date(b.start).getTime();
    const endMs = new Date(b.end).getTime();

    for (const date of dates) {
      const dayStartMs = new Date(dateMinutesToUtcIso(date, 0)).getTime();
      const dayEndMs = new Date(dateMinutesToUtcIso(date, 24 * 60)).getTime();
      const s = Math.max(startMs, dayStartMs);
      const e = Math.min(endMs, dayEndMs);
      if (e > s) {
        result.get(date)!.push({
          start: Math.round((s - dayStartMs) / 60000),
          end: Math.round((e - dayStartMs) / 60000),
        });
      }
    }
  }

  return result;
}

/** 全体スケジュールに出す Google の予定1件。title は件名を出さない設定なら null */
export type GoogleEventItem = { start: number; end: number; title: string | null };

type GoogleEvent = {
  status?: string;
  summary?: string;
  visibility?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

/**
 * その日の Google の予定を、件名つきで取ってくる（全体スケジュール用）。
 *
 * 空き枠の計算（freeBusy）とそろえて、「予定なし」として入れた予定（transparency=transparent。
 * 終日の予定はふつうこれ）とキャンセル済みは出さない。
 * Google 側で「非公開」にした予定は、件名を出す設定でも件名を出さない。
 * 問い合わせられなかったときは null（呼び出し側で前回の分を使うなどする）。
 */
export async function fetchGoogleEventsOfDate(
  connection: ConnectionRow,
  date: string,
  withTitles: boolean,
): Promise<GoogleEventItem[] | null> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(connection);
  } catch {
    return null;
  }

  const dayStartMs = new Date(dateMinutesToUtcIso(date, 0)).getTime();
  const dayEndMs = new Date(dateMinutesToUtcIso(date, 24 * 60)).getTime();
  const query = new URLSearchParams({
    timeMin: dateMinutesToUtcIso(date, 0),
    timeMax: dateMinutesToUtcIso(date, 24 * 60),
    singleEvents: "true", // 繰り返しの予定を1回ずつに展開してもらう
    orderBy: "startTime",
    maxResults: "100",
    fields: "items(status,summary,visibility,transparency,start,end)",
  });

  let res: Response;
  try {
    res = await fetch(`${EVENTS_URL}?${query.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as { items?: GoogleEvent[] };
  const result: GoogleEventItem[] = [];
  for (const e of data.items ?? []) {
    if (e.status === "cancelled" || e.transparency === "transparent") continue;
    let s: number;
    let t: number;
    if (e.start?.dateTime && e.end?.dateTime) {
      s = Math.max(new Date(e.start.dateTime).getTime(), dayStartMs);
      t = Math.min(new Date(e.end.dateTime).getTime(), dayEndMs);
    } else if (e.start?.date && e.end?.date) {
      // 終日の予定（「予定あり」にしたもの）。終わりの日付はその日を含まない
      if (!(e.start.date <= date && date < e.end.date)) continue;
      s = dayStartMs;
      t = dayEndMs;
    } else {
      continue;
    }
    if (t <= s) continue;
    const hidden = e.visibility === "private" || e.visibility === "confidential";
    result.push({
      start: Math.round((s - dayStartMs) / 60000),
      end: Math.round((t - dayStartMs) / 60000),
      title: withTitles && !hidden && e.summary ? e.summary.slice(0, 100) : null,
    });
  }
  return result;
}
