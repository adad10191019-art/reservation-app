"use server";

/**
 * 自分自身のログイン情報（メールアドレス・パスワード）を変更する。
 *
 * settings-actions.ts の resetAccountPassword は「同じ部署の誰かを、
 * オーナーが変更する」もので、tenantId で絞っている。
 * 全社管理者・社員は部署に属さない（tenantId が null）ため、その方法では
 * 自分自身を変更できない。ここでは常に userId だけで自分を特定する。
 *
 * 現在のパスワードを確認してから変更する（ログイン中のセッションを
 * 誰かに乗っ取られていた場合の、最後の防波堤として）。
 */
import { redirect } from "next/navigation";
import { requireTeamSession } from "./auth";
import { hashPassword, verifyPassword } from "./password";
import { prisma } from "./prisma";

const PATH = "/account";

function back(message?: string): never {
  redirect(message ? `${PATH}?error=${encodeURIComponent(message)}` : `${PATH}?done=1`);
}

/**
 * メールアドレスの重複を確かめる範囲。部署のアカウントは同じ部署と、部署に属さないアカウント
 * （全社管理者・社員）の間で重ならないこと。部署に属さないアカウントは、どのアカウントとも
 * 重ならないこと（ログインはメールで探すので、取り違えを防ぐ）。
 */
function emailScope(tenantId: string | null) {
  return tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {};
}

export async function updateOwnAccount(formData: FormData) {
  const session = await requireTeamSession();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!currentPassword) back("現在のパスワードを入力してください");
  if (!newEmail) back("メールアドレスを入力してください");
  if (newPassword && newPassword.length < 8) back("新しいパスワードは8文字以上にしてください");

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) back("アカウントが見つかりません");

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) back("現在のパスワードが違います");

  if (newEmail !== user.email) {
    const taken = await prisma.user.findFirst({
      where: { email: newEmail, NOT: { id: user.id }, ...emailScope(user.tenantId) },
    });
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
