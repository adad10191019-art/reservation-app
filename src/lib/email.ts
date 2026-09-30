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

/**
 * お客様にメールを届けられるか。お客様向けの機能（確認コードのログインなど）を
 * 出すかどうかをこれで決める。
 *
 * 送信元が Resend のテスト用アドレス（@resend.dev）のままだと、Resend に登録した
 * 本人のアドレスにしか届かず、お客様はコードを受け取れない。その間は
 * 「未設定」とみなして、予約画面にメールの入力欄を出さない。
 * TODO: 送信ドメインの認証が済んで EMAIL_FROM を自分のドメインに変えたら、
 * この一時的な判定（isResendTestSender）は外す。
 */
export function isEmailConfigured(): boolean {
  const from = process.env.EMAIL_FROM;
  return Boolean(resolveApiKey() && from && !isResendTestSender(from));
}

function isResendTestSender(from: string): boolean {
  return from.toLowerCase().includes("@resend.dev");
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
