"use server";

/**
 * 自分自身のログイン情報（メールアドレス・パスワード）を変更する。
 *
 * settings-actions.ts の resetAccountPassword は「同じ部署の誰かのパスワードを、
 * オーナーが初期状態に戻す」もの。ここでは常に userId だけで自分を特定する。
 *
 * ふだんの変更は、現在のパスワードを確認してから行う（ログイン中のセッションを
 * 誰かに乗っ取られていた場合の、最後の防波堤として）。
 * 発行したまま（初期パスワード＝メールアドレス）の最初の変更だけは、確認を省く
 * （たった今その初期パスワードでログインしたところなので）。
 */
import { redirect } from "next/navigation";
import { FIRST_PASSWORD_PATH, requireSessionForFirstPassword, requireTeamSession } from "./auth";
import { hashPassword, verifyPassword } from "./password";
import { prisma } from "./prisma";

const PATH = "/account";

function back(message?: string): never {
  redirect(message ? `${PATH}?error=${encodeURIComponent(message)}` : `${PATH}?done=1`);
}

/** 新しいパスワードとして使えるか。使えなければ理由を返す */
function checkNewPassword(password: string, email: string): string | null {
  if (password.length < 8) return "新しいパスワードは8文字以上にしてください";
  if (password.toLowerCase() === email.toLowerCase()) {
    return "メールアドレスと同じパスワードは使えません（最初のパスワードと同じになるため）";
  }
  return null;
}

export async function updateOwnAccount(formData: FormData) {
  const session = await requireTeamSession();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!currentPassword) back("現在のパスワードを入力してください");
  if (!newEmail) back("メールアドレスを入力してください");

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) back("アカウントが見つかりません");

  if (newPassword) {
    const problem = checkNewPassword(newPassword, newEmail);
    if (problem) back(problem);
  }

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) back("現在のパスワードが違います");

  // ログインはメールで探すので、どのアカウントとも重ならないこと
  if (newEmail !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email: newEmail } });
    if (taken) back("そのメールアドレスは既に使われています");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      email: newEmail,
      ...(newPassword ? { passwordHash: await hashPassword(newPassword) } : {}),
    },
  });

  back();
}

/** 最初のログインで、初期パスワード（メールアドレスと同じ）から自分のパスワードに変える */
export async function setFirstPassword(formData: FormData) {
  const session = await requireSessionForFirstPassword();
  const fail = (message: string): never =>
    redirect(`${FIRST_PASSWORD_PATH}?error=${encodeURIComponent(message)}`);

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");
  // 変更済みの人がこの画面を開き直した場合は、ふだんの変更（現在のパスワードの確認あり）へ
  if (!user.mustChangePassword) redirect(PATH);

  const problem = checkNewPassword(newPassword, user.email);
  if (problem) fail(problem);
  if (newPassword !== confirm) fail("確認のために入れたパスワードが一致しません");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });

  redirect(session.role === "member" ? "/team" : session.staffId && session.role === "staff" ? "/my-schedule" : "/calendar");
}
