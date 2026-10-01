/**
 * 予約の確認画面で入力してもらう「お名前」「電話番号」の整え方と確かめ方。
 *
 * DB には触らない（テストしやすくするため）。保存は customer-store.ts。
 */

export const NAME_MAX_LENGTH = 50;

/** 電話番号の数字の桁数。国内の固定・携帯（10〜11桁）と、+81 から始まる書き方を受け付ける */
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

export type CustomerProfileInput = { name: string; phone: string | null };

export type CustomerProfileResult =
  | { ok: true; value: CustomerProfileInput }
  | { ok: false; message: string };

/** 全角の数字・記号を半角に寄せる */
function toHalfWidth(text: string): string {
  return text.replace(/[０-９＋（）]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 前後の空白を落とし、途中の空白（全角も）は半角1つにまとめる */
export function normalizeName(raw: string): string {
  return raw.replace(/[\s　]+/g, " ").trim();
}

/**
 * 電話番号を整える。空なら null。
 * 全角数字やいろいろな横棒（ー－―‐）は半角に直し、空白は取り除く。
 */
export function normalizePhone(raw: string): string | null {
  const text = toHalfWidth(raw)
    .replace(/[ー－―‐−]/g, "-")
    .replace(/[\s　]+/g, "");
  return text === "" ? null : text;
}

export function validateCustomerProfile(input: {
  name: string;
  phone: string;
}): CustomerProfileResult {
  const name = normalizeName(input.name);
  if (!name) return { ok: false, message: "お名前（フルネーム）を入力してください" };
  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false, message: `お名前は${NAME_MAX_LENGTH}文字以内で入力してください` };
  }
  // 記号や絵文字だけの名前では、お店の側で誰か分からないため
  if (!/\p{L}/u.test(name)) {
    return { ok: false, message: "お名前は文字で入力してください（記号だけにはできません）" };
  }

  const phone = normalizePhone(input.phone);
  if (phone !== null) {
    const digits = phone.replace(/\D/g, "").length;
    if (
      !/^\+?[\d\-()]+$/.test(phone) ||
      digits < PHONE_MIN_DIGITS ||
      digits > PHONE_MAX_DIGITS
    ) {
      return { ok: false, message: "電話番号の形式が正しくありません（例：090-1234-5678）" };
    }
  }

  return { ok: true, value: { name, phone } };
}
