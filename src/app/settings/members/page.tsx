import Link from "next/link";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { requireOwner } from "@/lib/auth";
import { linkStaffToEmployee } from "@/lib/employee-actions";
import { managedTenantIds, memberRoleLabel } from "@/lib/member-access";
import { createMember } from "@/lib/member-actions";
import { type MemberRow, loadMemberList } from "@/lib/member-list";
import { prisma } from "@/lib/prisma";
import { DeptChecks } from "./dept-checks";

const INPUT = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-base sm:text-sm";

/**
 * メンバーの一覧と追加。1人の登録は「名前・メール・担当部署のチェック」だけで済む。
 * 細かい変更（役割・対応メニュー・退職など）は、名前を押して開く1人の画面で行う。
 */
export default async function MembersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOwner();
  const isAdmin = session.role === "group_admin";
  const list = await loadMemberList(session);
  const managed = managedTenantIds(session, list.tenants.map((t) => t.id));

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} notice={sp.notice} />

      <details
        open={list.active.length === 0 || Boolean(sp.error)}
        className="rounded-lg border border-neutral-200 bg-white"
      >
        <summary className="cursor-pointer px-4 py-3 font-semibold">＋ メンバーを追加</summary>
        <form action={createMember} className="space-y-3 border-t border-neutral-100 p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">名前</span>
            <input type="text" name="name" required placeholder="佐藤 一郎" className={INPUT} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              メールアドレス（ログインID）
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="off"
              placeholder="sato@example.com"
              className={INPUT}
            />
          </label>
          <DeptChecks
            tenants={list.tenants}
            managedIds={managed}
            current={[]}
            ownTenantOnly={!isAdmin}
          />
          <SubmitButton
            pendingText="登録中…"
            className="w-full rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 sm:w-auto"
          >
            登録する
          </SubmitButton>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-neutral-500">
            <li>
              最初のパスワードは<strong>メールアドレスと同じ</strong>です。本人は最初にログインしたときに、
              自分のパスワードに変えます。
            </li>
            <li>部署に登録した人は、その部署の受付中の全メニューに対応した状態で始まります。</li>
            <li>
              <strong>オーナー</strong>は部署の予約と設定をすべて扱えます。<strong>一般</strong>は
              カレンダーを見られ、操作できるのは自分の予約だけです。
            </li>
            <li>
              ほかの部署で登録済みの人のメールを入れると、同じ人としてこの部署を足します（パスワードは今のまま）。
            </li>
          </ul>
        </form>
      </details>

      <section>
        <h2 className="mb-2 font-semibold">メンバー（{list.active.length}名）</h2>
        <MemberList rows={list.active} showDepts={isAdmin} currentTenantId={session.tenantId} />
      </section>

      {list.inactive.length > 0 && (
        <details className="rounded-lg border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-600">
            在籍していない人・ほかの部署へ移った人（{list.inactive.length}名）
          </summary>
          <div className="border-t border-neutral-100">
            <MemberList rows={list.inactive} showDepts currentTenantId={session.tenantId} muted />
          </div>
        </details>
      )}

      {(list.looseUsers.length > 0 || list.looseStaffs.length > 0) && (
        <LooseSection
          looseUsers={list.looseUsers}
          looseStaffs={list.looseStaffs}
        />
      )}

      {isAdmin && <ManualLink />}
    </div>
  );
}

function MemberList({
  rows,
  showDepts,
  currentTenantId,
  muted,
}: {
  rows: MemberRow[];
  showDepts: boolean;
  currentTenantId: string;
  muted?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
        まだメンバーがいません。上の「メンバーを追加」から登録してください。
      </p>
    );
  }
  return (
    <ul
      className={`divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 ${
        muted ? "border-0 bg-neutral-50" : "bg-white"
      }`}
    >
      {rows.map((r) => {
        // オーナーには今の部署での役割、全社管理者には全部署を並べる
        const depts = showDepts ? r.depts : r.depts.filter((d) => d.tenantId === currentTenantId);
        return (
          <li key={r.employeeId}>
            <Link
              href={`/settings/members/${r.employeeId}`}
              className="flex items-center gap-2 px-4 py-3 hover:bg-neutral-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{r.name}</span>
                  {r.isGroupAdmin && <Tag tone="sky">全社管理者</Tag>}
                  {!r.isActive && <Tag>退職</Tag>}
                  {!r.email && <Tag tone="amber">メール未登録</Tag>}
                  {r.email && r.mustChangePassword && <Tag>最初のパスワードのまま</Tag>}
                </div>
                <div className="truncate text-xs text-neutral-500">
                  {depts.length > 0
                    ? depts.map((d) => `${d.tenantName}・${memberRoleLabel(d.role)}`).join(" ／ ")
                    : "部署なし（全社の1日のみ）"}
                </div>
              </div>
              <span aria-hidden className="text-neutral-400">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "sky" | "amber" }) {
  const color =
    tone === "sky"
      ? "border-sky-300 bg-sky-50 text-sky-800"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-neutral-300 bg-neutral-50 text-neutral-600";
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${color}`}>{children}</span>;
}

/**
 * 名簿とつながっていない古いデータ。メールを確かめて「メンバーにする」と、
 * 名簿の人・ログイン・部署の担当がそろった1人のメンバーになる。
 */
function LooseSection({
  looseUsers,
  looseStaffs,
}: {
  looseUsers: { email: string; name: string; tenantId: string; tenantName: string; role: string }[];
  looseStaffs: { id: string; name: string; tenantId: string; tenantName: string }[];
}) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <h2 className="mb-1 font-semibold">メンバーとしてまだ整っていない人</h2>
      <p className="mb-3 text-xs leading-relaxed text-neutral-600">
        この画面ができる前に、ログインだけ・予約を受ける人だけを作った人です。名前とメールを確かめて
        「メンバーにする」を押すと、ほかのメンバーと同じ形になります（全社の1日にも並びます）。
      </p>
      <div className="space-y-2">
        {looseUsers.map((u) => (
          <form
            key={`${u.email}-${u.tenantId}`}
            action={createMember}
            className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-white p-2"
          >
            <input type="hidden" name="tenantIds" value={u.tenantId} />
            <input type="hidden" name={`role_${u.tenantId}`} value={u.role} />
            <input type="hidden" name="email" value={u.email} />
            <span className="w-full break-all text-xs text-neutral-600">
              {u.email}（{u.tenantName}・{memberRoleLabel(u.role)}）
            </span>
            <input
              type="text"
              name="name"
              required
              defaultValue={u.name}
              placeholder="名前"
              aria-label={`${u.email} の名前`}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-base sm:text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm hover:bg-neutral-50"
            >
              メンバーにする
            </button>
          </form>
        ))}
        {looseStaffs.map((s) => (
          <form
            key={s.id}
            action={createMember}
            className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-white p-2"
          >
            <input type="hidden" name="tenantIds" value={s.tenantId} />
            <input type="hidden" name="name" value={s.name} />
            <span className="w-full text-sm">
              {s.name}
              <span className="ml-1 text-xs text-neutral-500">（{s.tenantName}・ログインなし）</span>
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="off"
              placeholder="ログインに使うメール"
              aria-label={`${s.name} のメールアドレス`}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-base sm:text-sm"
            />
            <input type="hidden" name={`role_${s.tenantId}`} value="staff" />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm hover:bg-neutral-50"
            >
              メンバーにする
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

/** 名前が違う予約担当と名簿の人を、名前を変えずに結ぶ（全社管理者だけ。まれに使う） */
async function ManualLink() {
  const [tenants, employees] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        staffs: {
          where: { isActive: true },
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, employeeId: true },
        },
      },
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <details className="rounded-lg border border-neutral-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-600">
        部署での名前が違う人を手で結ぶ（まれに使う）
      </summary>
      <div className="space-y-3 border-t border-neutral-100 p-3">
        <p className="text-xs leading-relaxed text-neutral-500">
          ふだんは使いません。部署での表示名がメンバーの名前と違う（例：部署では「竹内」、メンバーは「竹内 太郎」）
          ため自動でまとまらなかったときに、同じ人として結びます。1つの部署に同じ人を2回は結べません。
        </p>
        {tenants.map((tenant) => (
          <div key={tenant.id} className="rounded-md border border-neutral-200">
            <h3 className="border-b border-neutral-100 px-3 py-2 text-sm font-medium">{tenant.name}</h3>
            {tenant.staffs.length === 0 ? (
              <p className="px-3 py-2 text-sm text-neutral-500">在籍中の人はいません。</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {tenant.staffs.map((staff) => (
                  <form
                    key={staff.id}
                    action={linkStaffToEmployee}
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                  >
                    <input type="hidden" name="staffId" value={staff.id} />
                    <span className="w-32 truncate text-sm">{staff.name}</span>
                    <span className="text-xs text-neutral-400">→</span>
                    <select
                      name="employeeId"
                      defaultValue={staff.employeeId ?? ""}
                      aria-label={`${staff.name} を結ぶ相手`}
                      className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    >
                      <option value="">（結ばない）</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm hover:bg-neutral-50"
                    >
                      保存
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
