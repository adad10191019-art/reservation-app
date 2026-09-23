import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";

export default async function Home() {
  const session = await getVerifiedSession();
  // ログインしていない場合は /calendar 側のログイン画面へのリダイレクトに任せる
  const staffOnly = session && session.role !== "owner" && session.staffId;
  redirect(staffOnly ? "/my-schedule" : "/calendar");
}
