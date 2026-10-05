/**
 * Googleカレンダーとの双方向連携。
 *
 * アプリ→カレンダーは calendarToken によるURL購読（ics.ts）が別にあるので、
 * ここが担うのはカレンダー→アプリの向き（本人のGoogleカレンダーにある予定を
 * 「空いていない時間」として取り込み、全体スケジュールにも出す）と、
 * アプリの画面から本人が自分の Google の予定を直す・消すこと（2026-10-05 から。ユーザーの希望）。
 *
 * 連携は人（社員名簿）に付く。本人が自分のGoogleアカウントで許可し、以後はリフレッシュトークンで
 * 裏側からアクセストークンを取り直し続ける（LINEログインと同じ、fetchだけの実装）。
 */
import { prisma } from "./prisma";
import { type GoogleEvent, type GoogleEventItem, splitGoogleEventsByDate } from "./google-event-split";
import { GoogleGrantRevokedError, isRevokedGrantResponse } from "./google-grant";
import { addDays, dateMinutesToUtcIso } from "./time";

export type { GoogleEventItem } from "./google-event-split";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const READ_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const EDIT_SCOPE = "https://www.googleapis.com/auth/calendar.events";

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
    // 空き具合・予定を読む（readonly）、アプリから予定を直す・消す（events）。
    // 画面に表示する連携先メールアドレスの取得のため、email も一緒に求める
    scope: `${READ_SCOPE} ${EDIT_SCOPE} email`,
    state,
  });
  return `${AUTHORIZE_URL}?${query.toString()}`;
}

/** 認可コードを、リフレッシュトークン等と交換する */
export async function exchangeCodeForTokens(
  code: string,
): Promise<{ refreshToken: string; accessToken: string; expiresIn: number; email: string; canEdit: boolean }> {
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
    /** 実際に許可された範囲（空白区切り）。許可画面で書き換えの許可を外されることもある */
    scope?: string;
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
    canEdit: (token.scope ?? "").split(" ").includes(EDIT_SCOPE),
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
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    if (isRevokedGrantResponse(res.status, body)) throw new GoogleGrantRevokedError();
    throw new Error("Googleからトークンを受け取れませんでした");
  }

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
  brokenAt: Date | null;
};

/**
 * 切れたことを残す。切れたまま気づかないと、予約受付が Google の予定を見ずに枠を出してしまうので、
 * 本人（アカウント情報・全体スケジュール・自分の予定）と全体スケジュールの列に出して、つなぎ直してもらう。
 * 残せなくても読み込みは続ける（次に開いたときにまた試す）。
 */
async function markBroken(employeeId: string): Promise<void> {
  try {
    await prisma.googleCalendarConnection.updateMany({
      where: { employeeId, brokenAt: null },
      data: { brokenAt: new Date(), accessToken: null, accessTokenExpiresAt: null },
    });
  } catch (e) {
    console.error("[Google連携] 切れたことを残せませんでした", e);
  }
}

/**
 * 有効なアクセストークンを返す。期限切れならリフレッシュしてDBに保存し直す。
 * 切れている連携は Google に問い合わせず、すぐ GoogleGrantRevokedError にする。
 */
async function getValidAccessToken(connection: ConnectionRow): Promise<string> {
  if (connection.brokenAt) throw new GoogleGrantRevokedError();

  const stillValid =
    connection.accessToken &&
    connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
  if (stillValid) return connection.accessToken as string;

  let refreshed: { accessToken: string; expiresIn: number };
  try {
    refreshed = await refreshAccessToken(connection.refreshToken);
  } catch (e) {
    if (e instanceof GoogleGrantRevokedError) await markBroken(connection.employeeId);
    throw e;
  }
  await prisma.googleCalendarConnection.update({
    where: { employeeId: connection.employeeId },
    data: {
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
    },
  });
  return refreshed.accessToken;
}

/** 名簿の人のうち、Google の連携が切れている人の ID */
export async function findBrokenGoogleEmployeeIds(employeeIds: string[]): Promise<Set<string>> {
  if (!isGoogleCalendarConfigured() || employeeIds.length === 0) return new Set();
  const rows = await prisma.googleCalendarConnection.findMany({
    where: { employeeId: { in: employeeIds }, brokenAt: { not: null } },
    select: { employeeId: true },
  });
  return new Set(rows.map((r) => r.employeeId));
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

/**
 * 何日分かの Google の予定を、件名つきでまとめて1回で取ってくる（全体スケジュール・自分の予定用）。
 * 日付ごとへの分け方（出さない予定・件名を隠す予定）は google-event-split.ts。
 * 問い合わせられなかったときは null（呼び出し側で前回の分を使うなどする）。
 */
export async function fetchGoogleEventsOfDates(
  connection: ConnectionRow,
  dates: string[],
  withTitles: boolean,
): Promise<Map<string, GoogleEventItem[]> | null> {
  if (dates.length === 0) return new Map();
  const sorted = [...dates].sort();

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(connection);
  } catch {
    return null;
  }

  const query = new URLSearchParams({
    timeMin: dateMinutesToUtcIso(sorted[0], 0),
    timeMax: dateMinutesToUtcIso(sorted[sorted.length - 1], 24 * 60),
    singleEvents: "true", // 繰り返しの予定を1回ずつに展開してもらう
    orderBy: "startTime",
    // 1か月分（月表示は最大6週）でも1回で収まるよう、上限いっぱいにする
    maxResults: "2500",
    fields: "items(id,status,summary,visibility,transparency,start,end)",
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
  return splitGoogleEventsByDate(data.items ?? [], dates, withTitles);
}

/** Google の予定を直す・消すときの失敗（画面にそのまま出す文） */
export class GoogleEditError extends Error {}

type EditableConnection = ConnectionRow & { canEdit: boolean };

async function editRequest(connection: EditableConnection, eventId: string, init: RequestInit): Promise<Response> {
  if (!connection.canEdit) {
    throw new GoogleEditError(
      "Google の予定を直すには、アカウント情報で Google をつなぎ直してください（書き換えの許可が足りません）",
    );
  }
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(connection);
  } catch {
    throw new GoogleEditError("Google との連携が切れています。アカウント情報でつなぎ直してください");
  }
  try {
    return await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
  } catch {
    throw new GoogleEditError("Google とやり取りできませんでした。少し待ってからもう一度お試しください");
  }
}

function failureMessage(status: number): string {
  if (status === 403) {
    return "この予定はアプリから直せません（ほかの人が作った予定など）。Google カレンダーで直してください";
  }
  if (status === 404 || status === 410) {
    return "Google カレンダーにこの予定が見つかりません（すでに消えている可能性があります）";
  }
  return "Google の予定を直せませんでした。少し待ってからもう一度お試しください";
}

/**
 * Google の予定（繰り返しの予定なら、その回だけ）の日時・件名を直す。
 * 0:00〜24:00 は終日の予定にする。title が null なら件名は変えない（件名を出さない設定で取ってきた予定のため）。
 */
export async function updateGoogleEvent(
  connection: EditableConnection,
  eventId: string,
  change: { date: string; start: number; end: number; title: string | null },
): Promise<void> {
  const allDay = change.start === 0 && change.end === 24 * 60;
  const body: Record<string, unknown> = allDay
    ? {
        start: { date: change.date, dateTime: null },
        end: { date: addDays(change.date, 1), dateTime: null },
      }
    : {
        start: { dateTime: dateMinutesToUtcIso(change.date, change.start), date: null },
        end: { dateTime: dateMinutesToUtcIso(change.date, change.end), date: null },
      };
  if (change.title !== null) body.summary = change.title;

  const res = await editRequest(connection, eventId, { method: "PATCH", body: JSON.stringify(body) });
  if (!res.ok) throw new GoogleEditError(failureMessage(res.status));
}

/** Google の予定（繰り返しの予定なら、その回だけ）を消す。すでに消えていれば何もしない */
export async function deleteGoogleEvent(connection: EditableConnection, eventId: string): Promise<void> {
  const res = await editRequest(connection, eventId, { method: "DELETE" });
  if (!res.ok && res.status !== 410 && res.status !== 404) throw new GoogleEditError(failureMessage(res.status));
}
