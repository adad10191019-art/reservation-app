import { redirect } from "next/navigation";
import { getVerifiedAnySession } from "@/lib/auth";

export default async function Home() {
  const session = await getVerifiedAnySession();
  // 社員（部署に属さない人）が使えるのは「全社の1日」だけ
  if (session?.role === "member") redirect("/team");
  // ログインしていない場合は /calendar 側のログイン画面へのリダイレクトに任せる
  const staffOnly = session && session.role !== "owner" && session.staffId;
  redirect(staffOnly ? "/my-schedule" : "/calendar");
}
