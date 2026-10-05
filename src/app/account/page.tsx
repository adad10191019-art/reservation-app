import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/banner";
import { updateOwnAccount } from "@/lib/account-actions";
import { SubmitButton } from "@/components/submit-button";
import { requireTeamSession } from "@/lib/auth";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  setGoogleShowTitles,
} from "@/lib/google-calendar-actions";
import { CACHE_MINUTES } from "@/lib/google-calendar-cache";
import { prisma } from "@/lib/prisma";
import { getTeamViewer } from "@/lib/team";
import { formatDateLabel, toHm, toJstDateString } from "@/lib/time";

/** ある瞬間を日本時間の「10月3日(金) 18:05」にする */
function formatJst(instant: Date): string {
  const minutes = Math.floor(((instant.getTime() + 9 * 60 * 60 * 1000) % 86_400_000) / 60_000);
  return `${formatDateLabel(toJstDateString(instant))} ${toHm(minutes)}`;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "オーナー",
  staff: "スタッフ",
  group_admin: "全社管理者",
  member: "社員",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireTeamSession();

  const [user, viewer] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } }),
    getTeamViewer(session),
  ]);
  // Google カレンダーの連携は人（名簿）に付く
  const google = viewer.employeeId
    ? await prisma.googleCalendarConnection.findUnique({
        where: { employeeId: viewer.employeeId },
        select: { googleEmail: true, showTitles: true, brokenAt: true, canEdit: true },
      })
    : null;

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <AppHeader tenantName="アカウント情報" subtitle="ログイン情報の変更" session={session}>
        {/* 社員（部署に属さない人）はカレンダーを使えないので、全体スケジュールへ戻す */}
        <Link
          href={session.tenantId === null ? "/team" : "/calendar"}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          {session.tenantId === null ? "全体スケジュールへ" : "カレンダーへ"}
        </Link>
      </AppHeader>

      <Banner error={sp.error} done={sp.done} />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">ログイン情報</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          現在: {user?.email}（{ROLE_LABEL[session.role] ?? session.role}）
        </p>

        <form action={updateOwnAccount} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              新しいメールアドレス
            </span>
            <input
              type="email"
              name="email"
              required
              defaultValue={user?.email}
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              新しいパスワード（変更する場合のみ）
            </span>
            <input
              type="password"
              name="newPassword"
              minLength={8}
              autoComplete="new-password"
              placeholder="8文字以上（空欄なら変更しない）"
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              現在のパスワード（確認のため）
            </span>
            <input
              type="password"
              name="currentPassword"
              required
              autoComplete="current-password"
              className="w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            変更する
          </button>
        </form>
      </section>

      <section className="mt-5 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">Googleカレンダーをつなぐ</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          つなぐと、自分のGoogleカレンダーの予定が全体スケジュールに出て、担当している全部の部署の予約受付で
          「空いていない時間」になります。予定をこちらに入れ直す必要はありません。
          全体スケジュールへの反映は最大{CACHE_MINUTES}分遅れます（予約受付はその場で確かめます）。
          自分の予定・全体スケジュールで Google の予定を押すと、その予定の日時・件名を直したり消したりもできます
          （Googleカレンダーにもそのまま反映されます）。アプリが勝手に書き換えることはありません。
        </p>

        {!isGoogleCalendarConfigured() ? (
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
            Googleカレンダー連携はまだ準備中です。
          </p>
        ) : !viewer.employeeId ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            このアカウントは社員名簿とひも付いていないため、つなげません。全社管理者に依頼してください。
          </p>
        ) : google ? (
          <div className="space-y-4">
            {google.brokenAt ? (
              <div
                role="alert"
                className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-800"
              >
                <p>
                  {google.googleEmail} との連携が切れています（{formatJst(google.brokenAt)}ごろから）。
                  今はGoogleの予定が予約受付・全体スケジュールに反映されていません。つなぎ直してください。
                </p>
                <form action={connectGoogleCalendar}>
                  <button
                    type="submit"
                    className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
                  >
                    Googleカレンダーをつなぎ直す
                  </button>
                </form>
              </div>
            ) : (
              <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                つないでいます：{google.googleEmail}
              </p>
            )}
            {!google.brokenAt && !google.canEdit && (
              // 2026-10-05 より前につないだ人は、予定を直す・消す許可をまだもらっていない
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
                <p>Google の予定をアプリから直す・消すには、つなぎ直して書き換えの許可を足してください。</p>
                <form action={connectGoogleCalendar}>
                  <button
                    type="submit"
                    className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
                  >
                    Googleカレンダーをつなぎ直す
                  </button>
                </form>
              </div>
            )}

            <form action={setGoogleShowTitles} className="space-y-2">
              <p className="text-xs font-medium text-neutral-600">全体スケジュールでの見せ方（社員全員が見ます）</p>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="radio" name="showTitles" value="0" defaultChecked={!google.showTitles} />
                「予定あり」とだけ出す
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="radio" name="showTitles" value="1" defaultChecked={google.showTitles} />
                件名も出す（Googleで「非公開」にした予定は件名を出しません）
              </label>
              <SubmitButton
                pendingText="保存中…"
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                見せ方を保存
              </SubmitButton>
            </form>

            <form action={disconnectGoogleCalendar}>
              <SubmitButton
                pendingText="外しています…"
                confirmText="Googleカレンダーとのつながりを外しますか？全体スケジュールと予約受付に、Googleの予定が出なくなります。"
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50"
              >
                つながりを外す
              </SubmitButton>
            </form>
          </div>
        ) : (
          <form action={connectGoogleCalendar}>
            <button
              type="submit"
              className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Googleカレンダーをつなぐ
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
