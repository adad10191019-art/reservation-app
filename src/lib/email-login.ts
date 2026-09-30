/**
 * お客様のメールログイン（ワンタイムコード方式）。
 *
 * LINEログインが使えない・使いたくないクライアント向けの代替手段。
 * 新規登録は求めず、メールアドレス宛に届く6桁のコードで本人確認するだけにする
 * （LINEログインが「新しく登録する必要はない」のと同じ考え方）。
 *
 * コードは平文で保存せず、HMACでハッシュ化した値だけを持つ。
 * 総当たりを防ぐため、既存の login-attempts.ts（ログイン失敗のロック機構）を
 * 「customer-otp:テナントID:メールアドレス」というキーで間借りして使う。
 *
 * コードの送信回数も同じ仕組みで数える（キーは「customer-otp-send:…」）。
 * 上限が無いと、他人のアドレス宛に何通でも送らせることができ、
 * 迷惑メールの踏み台になるうえ、メール送信の枠も使い切られてしまう。
 * ログインに成功したら数え直す。
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { isEmailConfigured, sendNotificationEmail } from "./email";
import { isLocked, recordFailure, recordSuccess } from "./login-attempts";
import { prisma } from "./prisma";

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export type CustomerLoginMethods = { line: boolean; email: boolean };

/** テナントの設定から、お客様に見せるログイン方法を決める */
export function resolveCustomerLoginMethods(tenant: {
  customerLoginMethod: string | null;
  lineLoginChannelId: string | null;
  lineLoginChannelSecret: string | null;
}): CustomerLoginMethods {
  const lineAvailable = Boolean(
    (tenant.lineLoginChannelId || process.env.LINE_LOGIN_CHANNEL_ID) &&
      (tenant.lineLoginChannelSecret || process.env.LINE_LOGIN_CHANNEL_SECRET),
  );

  switch (tenant.customerLoginMethod) {
    case "line":
      return { line: lineAvailable, email: false };
    case "email":
      return { line: false, email: true };
    case "both":
      return { line: lineAvailable, email: true };
    default:
      // 自動：LINEが使えるならLINEを優先し、使えなければメールにする
      return { line: lineAvailable, email: !lineAvailable };
  }
}

function otpLockKey(tenantId: string, email: string): string {
  return `customer-otp:${tenantId}:${email.toLowerCase()}`;
}

/** 送信回数を数えるキー。ログインに成功しないまま上限まで送ると、しばらく送れなくなる */
function otpSendKey(tenantId: string, email: string): string {
  return `customer-otp-send:${tenantId}:${email.toLowerCase()}`;
}

function generateCode(): string {
  // 000000〜999999 を、先頭0埋めの6桁文字列にする
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

function hashCode(tenantId: string, email: string, code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET が設定されていません");
  // テナント・メールアドレスも混ぜ、他の組み合わせへの使い回しを防ぐ
  return createHmac("sha256", secret)
    .update(`${tenantId}:${email.toLowerCase()}:${code}`)
    .digest("hex");
}

export type StartEmailLoginResult = { ok: true } | { ok: false; message: string };

/** メールアドレス宛にコードを送る。ロック中や送信設定が無ければ失敗として返す */
export async function startEmailLoginCode(params: {
  tenantId: string;
  email: string;
}): Promise<StartEmailLoginResult> {
  const { tenantId, email } = params;

  if (!isEmailConfigured()) {
    return { ok: false, message: "メールでのログインは、まだ準備ができていません" };
  }

  const lockKey = otpLockKey(tenantId, email);
  const sendKey = otpSendKey(tenantId, email);
  if ((await isLocked(lockKey)) || (await isLocked(sendKey))) {
    return {
      ok: false,
      message: "試行回数が多すぎます。しばらくしてからもう一度お試しください",
    };
  }

  // 送れたかどうかに関わらず、送信の試み1回として数える
  await recordFailure(sendKey);

  // 古いコードが残っていても、新しいものだけを有効にする（使い回し防止）
  await prisma.customerLoginCode.deleteMany({ where: { tenantId, email } });

  const code = generateCode();
  await prisma.customerLoginCode.create({
    data: {
      tenantId,
      email,
      codeHash: hashCode(tenantId, email, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
    },
  });

  const result = await sendNotificationEmail({
    to: email,
    subject: "【予約】ログイン確認コード",
    text: [
      `確認コード：${code}`,
      "",
      `${CODE_TTL_MINUTES}分以内に、予約ページの入力欄にこのコードを入れてください。`,
      "心当たりが無い場合は、このメールは破棄してください。",
    ].join("\n"),
  });

  if (!result.ok) {
    return { ok: false, message: "メールの送信に失敗しました。時間をおいてお試しください" };
  }
  if (!result.sent) {
    // 設定が無いだけで例外にはしていない（email.ts の方針）が、
    // OTPは届かないと本人確認できないため、ここでは失敗として扱う
    return { ok: false, message: "メールでのログインは、まだ準備ができていません" };
  }

  return { ok: true };
}

export type VerifyEmailLoginResult =
  | { ok: true }
  | { ok: false; message: string; expired?: boolean };

/** 入力されたコードを確かめる。成功したら、そのコードは使えなくする */
export async function verifyEmailLoginCode(params: {
  tenantId: string;
  email: string;
  code: string;
}): Promise<VerifyEmailLoginResult> {
  const { tenantId, email, code } = params;
  const lockKey = otpLockKey(tenantId, email);

  if (await isLocked(lockKey)) {
    return {
      ok: false,
      message: "試行回数が多すぎます。しばらくしてからもう一度お試しください",
    };
  }

  const record = await prisma.customerLoginCode.findFirst({
    where: { tenantId, email },
    orderBy: { createdAt: "desc" },
  });

  if (!record || record.expiresAt <= new Date()) {
    return {
      ok: false,
      expired: true,
      message: "コードの有効期限が切れました。もう一度送信してください",
    };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.customerLoginCode.deleteMany({ where: { id: record.id } });
    return {
      ok: false,
      expired: true,
      message: "試行回数が多すぎます。もう一度送信してください",
    };
  }

  const expected = Buffer.from(record.codeHash, "hex");
  const actual = Buffer.from(hashCode(tenantId, email, code.trim()), "hex");
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await prisma.customerLoginCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    await recordFailure(lockKey);
    return { ok: false, message: "コードが正しくありません" };
  }

  await prisma.customerLoginCode.deleteMany({ where: { id: record.id } });
  await recordSuccess(lockKey);
  await recordSuccess(otpSendKey(tenantId, email));
  return { ok: true };
}
