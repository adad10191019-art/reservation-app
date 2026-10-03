/**
 * 自分の Google カレンダーの連携が切れていたら、つなぎ直しを促す帯を出す（全体スケジュール・自分の予定）。
 * 切れたままだと予約受付が Google の予定を見ずに枠を出してしまうので、本人が開く画面で目に入るようにする。
 */
import Link from "next/link";
import { findBrokenGoogleEmployeeIds } from "@/lib/google-calendar";

export async function GoogleBrokenNotice({ employeeId }: { employeeId: string | null }) {
  if (!employeeId) return null;
  const broken = await findBrokenGoogleEmployeeIds([employeeId]);
  if (!broken.has(employeeId)) return null;

  return (
    <p
      role="alert"
      className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-800"
    >
      Googleカレンダーとの連携が切れています。今はGoogleの予定が予約受付・全体スケジュールに反映されていません。
      <Link href="/account" className="ml-1 font-medium underline">
        アカウント情報でつなぎ直す
      </Link>
    </p>
  );
}
