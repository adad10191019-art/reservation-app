/**
 * 通知メール（Resend）。
 *
 * LINE連携がまだの担当者やお客様にも通知が届くよう、LINEの代わり・補完として使う。
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
 * 出すかどうかをこれで決める。送信元は認証済みのドメイン（notify.youth-personnel.com）を使う。
 */
export function isEmailConfigured(): boolean {
  return Boolean(resolveApiKey() && process.env.EMAIL_FROM);
}

/**
 * 差出人の表示名だけを差し替える。アドレスは EMAIL_FROM のまま（認証済みのドメイン）。
 *
 * EMAIL_FROM は「表示名 <アドレス>」でも「アドレス」だけでもよい。
 * 表示名は店舗名など自由に付けられる文字なので、ヘッダーを崩す文字
 * （改行・引用符・山かっこ・バックスラッシュ）を除いてから引用符で囲む。
 */
export function withSenderName(from: string, name: string | undefined): string {
  const cleaned = (name ?? "").replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return from;
  const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
  return `"${cleaned}" <${address}>`;
}

/** 1人に送る。件名・本文はプレーンテキストで受け取る */
export async function sendNotificationEmail(params: {
  to: string;
  subject: string;
  text: string;
  /** 差出人の表示名（店舗名など）。省略すると EMAIL_FROM の表示名のまま */
  fromName?: string;
}): Promise<EmailResult> {
  const { to, subject, text, fromName } = params;

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
      from: withSenderName(from, fromName),
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
