import { redirect } from "next/navigation";

/** 設定→メンバー にまとめた。古いURL（ブックマークなど）から来た人を移す */
export default function MovedToMembers() {
  redirect("/settings/members");
}
