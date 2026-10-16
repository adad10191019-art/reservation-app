import { sealSecret } from "./secret-box";

/**
 * 秘密の鍵の入力欄（設定→店舗の LINE の欄）から、DB に入れる値を決める。
 *
 * 保存した値は画面に送らないので、欄はいつも空で表示される。
 *   ・「消す」に印 → null（共通の既定値に戻す）
 *   ・何か入れた   → 暗号化して保存
 *   ・空欄のまま   → 今 DB に入っている値をそのまま残す
 */
export function nextSecretValue(params: {
  input: FormDataEntryValue | null;
  clear: FormDataEntryValue | null;
  current: string | null;
}): string | null {
  if (params.clear) return null;
  const input = String(params.input ?? "").trim();
  if (input) return sealSecret(input);
  return params.current;
}
