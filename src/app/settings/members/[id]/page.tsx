import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { canResetPassword } from "@/lib/account-access";
import { requireOwner } from "@/lib/auth";
import { canEditPerson, managedTenantIds } from "@/lib/member-access";
import { deleteMember, resetMemberPassword, retireMember, saveMember } from "@/lib/member-actions";
import { loadMemberDetail, loadTenants } from "@/lib/member-list";
import { DeptChecks } from "../dept-checks";

const INPUT = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-base sm:text-sm";

/** 1人のメンバーの画面。名前・メール・担当部署・部署ごとの対応メニュー、その下に細かい操作 */
export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string; notice?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireOwner();
  const detail = await loadMemberDetail(session, id);
  if (!detail) notFound();

  const { row } = detail;
  const isAdmin = session.role === "group_admin";
  const tenants = await loadTenants();
  const managed = managedTenantIds(session, tenants.map((t) => t.id));
  const canEdit = canEditPerson(session, {
    isGroupAdmin: row.isGroupAdmin,
    tenantIds: row.depts.map((d) => d.tenantId),
  });
  const isSelf = detail.userId === session.userId;
  const resettable =
    !isSelf &&
    detail.userId !== null &&
    canResetPassword(session, {
      isGroupAdmin: row.isGroupAdmin,
      memberships: row.depts.filter((d) => d.role).map((d) => ({ tenantId: d.tenantId })),
    });
  // 対応メニューは、触れる部署で予約を受けている分だけ出す
  const menuDepts = detail.deptDetails.filter((d) => managed.includes(d.tenantId) && d.staffId);
  const ownDept = detail.deptDetails.find((d) => d.tenantId === session.tenantId);

  return (
    <div className="space-y-5">
      <Link href="/settings/members" className="text-sm text-sky-700 hover:underline">
        ‹ メンバーの一覧へ
      </Link>
      <Banner error={sp.error} done={sp.done} notice={sp.notice} />

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{row.name}</h2>
        {row.isGroupAdmin && (
          <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
            全社管理者
          </span>
        )}
        {isSelf && (
          <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
            自分
          </span>
        )}
      </div>

      {!row.isActive && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          退職の扱いになっています。部署にチェックを入れて保存すると、在籍に戻ります。
        </p>
      )}

      <form action={saveMember} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
        <input type="hidden" name="id" value={id} />

        {canEdit ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">名前</span>
              <input type="text" name="name" required defaultValue={row.name} className={INPUT} />
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
                defaultValue={row.email ?? ""}
                className={INPUT}
              />
            </label>
          </>
        ) : (
          <div className="text-sm">
            <p>
              <span className="text-xs text-neutral-500">メール：</span>
              {row.email ?? "未登録"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              ほかの部署も担当している人の名前・メールは、全社管理者が変えます。
            </p>
          </div>
        )}

        <DeptChecks
          tenants={tenants}
          managedIds={managed}
          current={row.depts.map((d) => ({ tenantId: d.tenantId, role: d.role }))}
        />

        {menuDepts.map((d) => (
          <fieldset key={d.tenantId}>
            <legend className="mb-1.5 text-xs font-medium text-neutral-600">
              対応メニュー（{d.tenantName}）
            </legend>
            <input type="hidden" name={`menusShown_${d.tenantId}`} value="1" />
            {d.menus.length === 0 ? (
              <p className="text-sm text-neutral-500">
                受付中のメニューがありません。「メニュー」タブで登録してください。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {d.menus.map((menu) => (
                  <label
                    key={menu.id}
                    className="cursor-pointer rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-50 has-checked:border-sky-500 has-checked:bg-sky-50 has-checked:text-sky-900"
                  >
                    <input
                      type="checkbox"
                      name={`menuIds_${d.tenantId}`}
                      value={menu.id}
                      defaultChecked={d.menuIds.includes(menu.id)}
                      className="sr-only"
                    />
                    {menu.name}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-neutral-500">
              全部外すと、この部署では予約を受けません（オーナーで予約を受けない人など）。
            </p>
          </fieldset>
        ))}

        <details className="rounded-md border border-neutral-200">
          <summary className="cursor-pointer px-3 py-2 text-sm text-neutral-600">並び順</summary>
          <div className="space-y-2 border-t border-neutral-100 p-3">
            {ownDept?.staffId && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-xs text-neutral-600">この部署のカレンダーでの並び順</span>
                <input
                  type="number"
                  name="staffOrder"
                  defaultValue={ownDept.staffOrder ?? 0}
                  className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                />
              </label>
            )}
            {isAdmin && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-xs text-neutral-600">全体スケジュールでの並び順</span>
                <input
                  type="number"
                  name="employeeOrder"
                  defaultValue={detail.displayOrder}
                  className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                />
              </label>
            )}
            <p className="text-xs text-neutral-500">小さい数ほど左に並びます。</p>
          </div>
        </details>

        <SubmitButton
          pendingText="保存中…"
          className="w-full rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 sm:w-auto"
        >
          {row.isActive ? "保存する" : "在籍に戻して保存する"}
        </SubmitButton>
      </form>

      <details className="rounded-lg border border-neutral-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-600">
          ほかの設定（ログインの状態・パスワード・退職）
        </summary>
        <div className="space-y-4 border-t border-neutral-100 p-4 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-medium text-neutral-600">ログイン</h3>
            {row.email ? (
              <p>
                {row.email}
                {row.mustChangePassword && (
                  <span className="ml-2 text-xs text-neutral-500">（まだ最初のパスワードのまま）</span>
                )}
              </p>
            ) : (
              <p className="text-amber-800">まだありません。上でメールを入れて保存すると作られます。</p>
            )}
            {resettable && (
              <form action={resetMemberPassword} className="mt-2">
                <input type="hidden" name="id" value={id} />
                <button
                  type="submit"
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  パスワードを初期状態に戻す
                </button>
                <p className="mt-1 text-xs text-neutral-500">
                  パスワードがメールアドレスと同じになり、本人は次のログインで新しいパスワードを決めます。
                </p>
              </form>
            )}
          </div>

          {row.depts.some((d) => d.role) && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-neutral-600">LINE での通知</h3>
              <ul className="space-y-0.5">
                {detail.deptDetails
                  .filter((d) => d.role)
                  .map((d) => (
                    <li key={d.tenantId}>
                      {d.tenantName}：
                      {d.lineLinked ? "LINE で受け取る" : "未設定（ログインのメールに届きます）"}
                    </li>
                  ))}
              </ul>
              <p className="mt-1 text-xs text-neutral-500">
                本人が
                <Link href="/notify" className="underline">
                  通知の受け取り
                </Link>
                画面で LINE を結ぶと切り替わります。
              </p>
            </div>
          )}

          {canEdit && !isSelf && !row.isGroupAdmin && row.isActive && (
            <form action={retireMember}>
              <input type="hidden" name="id" value={id} />
              <h3 className="mb-1 text-xs font-medium text-neutral-600">退職</h3>
              <button
                type="submit"
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50"
              >
                退職にする
              </button>
              <p className="mt-1 text-xs text-neutral-500">
                全部署から外れ、ログインできなくなります。過去の予約や予定の記録は残ります。
                今日以降の予約が残っている間はできません。
              </p>
            </form>
          )}

          {canEdit && !isSelf && !row.isGroupAdmin && !detail.hasRecords && (
            <form action={deleteMember}>
              <input type="hidden" name="id" value={id} />
              <h3 className="mb-1 text-xs font-medium text-neutral-600">登録の取り消し</h3>
              <button
                type="submit"
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50"
              >
                登録を取り消す
              </button>
              <p className="mt-1 text-xs text-neutral-500">
                間違えて登録したとき用です。予約も予定も1件も無い人だけ、ログインごと消せます。
              </p>
            </form>
          )}

          {!canEdit && (
            <p className="text-xs text-neutral-500">
              ほかの部署も担当している人の退職・パスワードは、全社管理者が扱います。
              この部署から外すだけなら、上のチェックを外して保存してください。
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
