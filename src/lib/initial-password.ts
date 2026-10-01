/**
 * アカウントの発行と「パスワードを初期状態に戻す」で使う、初期パスワード。
 *
 * 初期パスワードはメールアドレスと同じにする（本人に伝える手間を無くすため）。
 * その代わり、初期パスワードのままの間は mustChangePassword を立て、
 * 最初のログインで必ず変えてもらう（auth.ts が変更の画面以外を開かせない）。
 */
import { hashPassword } from "./password";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function initialPasswordData(email: string) {
  return { passwordHash: await hashPassword(email), mustChangePassword: true };
}
