/**
 * 担当者向けの通知メール（Resend）。
 *
 * LINE連携がまだの担当者にも通知が届くよう、LINEの代わり・補完として使う。
 * アクセストークンと同じ考え方で、キーが無い間は送らずに内容をログへ出すだけにする。
 * 通知が無くても予約そのものは成立させたいので、失敗しても例外は投げない。
 */
import { Resend } from "resend";

export type EmailResult =
  | { ok: true; sent: boolean; reason?: string }
  | { ok: false; reason: string };

function resolveApiKey(): string | null {
  return process.env.RESEND_API_KEY || null;
}

export function isEmailConfigured(): boolean {
  return Boolean(resolveApiKey());
}

/** 1人に送る。件名・本文はプレーンテキストで受け取る */
export async function sendNotificationEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailResult> {
  const { to, subject, text } = params;

  if (!to) return { ok: false, reason: "送り先のメールアドレスがありません" };

  const apiKey = resolveApiKey();
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.log(`[メール通知・未送信（未設定）] ${to}\n${subject}\n${text}\n`);
    return { ok: true, sent: false, reason: "メール送信の設定がまだです" };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to,
      subject,
      text,
    });
    if (result.error) {
      return { ok: false, reason: result.error.message };
    }
    return { ok: true, sent: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "送信に失敗しました" };
  }
}
