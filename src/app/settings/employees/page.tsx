import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { requireGroupAdmin } from "@/lib/auth";
import {
  createEmployee,
  deleteEmployee,
  issueMemberLogin,
  linkStaffToEmployee,
  resetMemberPassword,
  revokeMemberLogin,
  updateEmployee,
} from "@/lib/employee-actions";
import { employeeOptionLabel } from "@/lib/employee-names";
import { prisma } from "@/lib/prisma";

/**
 * 社員名簿（会社全体で1つ）。全社管理者だけが使える。
 * 上で社員を登録し、各行の「所属部署」のチェックで兼任先を選ぶ。
 * 下の「スタッフとのひも付け」は、名前が違うなどで自動でまとまらなかったスタッフを手で結ぶ補助。
 */
export default async function EmployeesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  await requireGroupAdmin();

  const [employees, tenants] = await Promise.all([
    prisma.employee.findMany({
      orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }],
      include: {
        staffs: {
          include: {
            tenant: { select: { name: true } },
            user: { select: { email: true } },
          },
        },
        user: { select: { email: true } },
        _count: { select: { events: true } },
      },
    }),
    prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        staffs: {
          orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, isActive: true, employeeId: true },
        },
      },
    }),
  ]);
  const activeEmployees = employees.filter((e) => e.isActive);
  const unlinkedCount = tenants.reduce(
    (n, t) => n + t.staffs.filter((s) => s.isActive && !s.employeeId).length,
    0,
  );

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />
      {!sp.error && sp.notice && (
        <p className="-mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          {sp.notice}
        </p>
      )}

      <p className="text-sm leading-relaxed text-neutral-600">
        会社全体の社員名簿です（全部署で共通）。「全社の1日」には、ここで在籍にしている人が1人1列で並びます。
        各行の「所属部署」で、その人が予約を受ける部署にチェックを入れて保存してください（兼任なら複数）。
        チェックした部署のどの予約・予定も、その人の全部署の予約受付で「空いていない時間」になります。
        どの部署にも属さない人（事務など）はチェック無しのままで、全社の1日にだけ並びます。
      </p>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">社員を追加</h2>
        <form action={createEmployee} className="flex flex-wrap items-end gap-2">
          <label className="block min-w-48 flex-1">
            <span className="mb-1 block text-xs font-medium text-neutral-600">名前</span>
            <input
              type="text"
              name="name"
              required
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <SubmitButton
            pendingText="追加中…"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            追加
          </SubmitButton>
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          追加したあと、名簿の行の「所属部署」にチェックを入れて保存すると、その部署のスタッフに同じ名前の人が
          いればひも付け、いなければスタッフとして作ります。
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">
          社員名簿（在籍 {activeEmployees.length}名 / 全 {employees.length}名）
        </h2>
        {employees.length === 0 ? (
          <p className="text-sm text-neutral-500">まだ登録されていません。</p>
        ) : (
          <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {employees.map((e) => (
              <div
                key={e.id}
                className={`space-y-1.5 px-3 py-2 ${e.isActive ? "" : "bg-neutral-50"}`}
              >
                <form action={updateEmployee} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={e.id} />
                  <input
                    type="text"
                    name="name"
                    defaultValue={e.name}
                    required
                    aria-label="名前"
                    className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  />
                  <label className="flex items-center gap-1 text-xs text-neutral-600">
                    表示順
                    <input
                      type="number"
                      name="displayOrder"
                      defaultValue={e.displayOrder}
                      className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-neutral-600">
                    <input type="checkbox" name="isActive" defaultChecked={e.isActive} />
                    在籍
                  </label>
                  <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
                    {e._count.events > 0 && `予定 ${e._count.events}件`}
                  </span>
                  <button
                    type="submit"
                    className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    保存
                  </button>
                  {/* 予定もひも付けも無い行だけ消せる（重複して作った行の後始末用） */}
                  {e.staffs.length === 0 && e._count.events === 0 && !e.user && (
                    <button
                      type="submit"
                      formAction={deleteEmployee}
                      formNoValidate
                      className="rounded-md border border-red-200 bg-white px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                    >
                      削除
                    </button>
                  )}
                  <fieldset className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
                    <legend className="sr-only">{e.name} の所属部署</legend>
                    <input type="hidden" name="tenantsShown" value="1" />
                    <span className="text-neutral-500">所属部署：</span>
                    {tenants.map((t) => {
                      const linked = t.staffs.find((s) => s.employeeId === e.id);
                      return (
                        <label key={t.id} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            name="tenantIds"
                            value={t.id}
                            defaultChecked={!!linked}
                          />
                          {t.name}
                          {linked && linked.name !== e.name && (
                            <span className="text-neutral-400">（{linked.name}）</span>
                          )}
                          {linked && !linked.isActive && (
                            <span className="text-neutral-400">（スタッフは無効）</span>
                          )}
                        </label>
                      );
                    })}
                    {tenants.length === 0 && <span>部署がありません</span>}
                  </fieldset>
                </form>
                <MemberLogin
                  employeeId={e.id}
                  isActive={e.isActive}
                  memberEmail={e.user?.email ?? null}
                  deptEmail={e.staffs.find((s) => s.user)?.user?.email ?? null}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 名前が違うなどで「所属部署」のチェックではまとまらない人を、手で結ぶ補助。ふだんは閉じておく */}
      <details className="rounded-lg border border-neutral-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm text-neutral-600">
          名前が違うスタッフを手で結ぶ（まれに使う）
          {unlinkedCount > 0 && (
            <span className="ml-2 text-xs text-amber-700">
              名簿とひも付いていない在籍中のスタッフが {unlinkedCount}名
              います（全社の1日に出ません）
            </span>
          )}
        </summary>
        <div className="border-t border-neutral-100 p-3">
          <p className="mb-3 text-xs leading-relaxed text-neutral-500">
            ふだんは上の「所属部署」のチェックで足ります。ここは、部署でのスタッフ名が名簿の名前と違う
            （例：部署では「竹内」、名簿では「竹内 太郎」）人を、名前を変えずに結ぶときに使います。
            兼任の人は「名簿に新しく作る」ではなく、一覧からその人（カッコ内は今の所属部署）を選んでください。
            1つの部署に同じ社員を2回ひも付けることはできません。
          </p>
          <div className="space-y-3">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="rounded-lg border border-neutral-200 bg-white">
                <h3 className="border-b border-neutral-100 px-3 py-2 text-sm font-medium">
                  {tenant.name}
                </h3>
                {tenant.staffs.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-neutral-500">スタッフがいません。</p>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {tenant.staffs.map((staff) => (
                      <form
                        key={staff.id}
                        action={linkStaffToEmployee}
                        className="flex flex-wrap items-center gap-2 px-3 py-2"
                      >
                        <input type="hidden" name="staffId" value={staff.id} />
                        <span className="w-40 truncate text-sm">
                          {staff.name}
                          {!staff.isActive && (
                            <span className="ml-1 text-xs text-neutral-400">（無効）</span>
                          )}
                        </span>
                        <span className="text-xs text-neutral-400">→</span>
                        <select
                          name="employeeId"
                          defaultValue={staff.employeeId ?? ""}
                          aria-label={`${staff.name} のひも付け先`}
                          className={`rounded-md border px-2 py-1 text-sm ${
                            staff.employeeId ? "border-neutral-300" : "border-amber-300 bg-amber-50"
                          }`}
                        >
                          <option value="">（ひも付けない）</option>
                          <option value="new">＋ 名簿に新しく作る（{staff.name}）</option>
                          {employees
                            .filter((e) => e.isActive || e.id === staff.employeeId)
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {employeeOptionLabel(
                                  e.name,
                                  e.staffs.map((s) => s.tenant.name),
                                )}
                              </option>
                            ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
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
        </div>
      </details>
    </div>
  );
}

const SMALL_INPUT = "rounded-md border border-neutral-300 px-2 py-1 text-xs";
const SMALL_BUTTON =
  "rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50";

/**
 * 名簿の1行の「ログイン」欄。部署に属さない人（事務など）が「全社の1日」を使うためのもの。
 * 部署のアカウントを持つ人は、そちらのヘッダーから「全社の1日」を開けるので発行しない。
 */
function MemberLogin({
  employeeId,
  isActive,
  memberEmail,
  deptEmail,
}: {
  employeeId: string;
  isActive: boolean;
  memberEmail: string | null;
  deptEmail: string | null;
}) {
  const label = <span className="text-neutral-500">ログイン：</span>;

  if (memberEmail) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
        {label}
        <span>
          {memberEmail}（社員用）
          {!isActive && <span className="text-neutral-400">（在籍していないため使えません）</span>}
        </span>
        <form action={resetMemberPassword} className="flex items-center gap-1">
          <input type="hidden" name="id" value={employeeId} />
          <input
            type="text"
            name="password"
            required
            minLength={8}
            autoComplete="off"
            placeholder="新しいパスワード（8文字以上）"
            aria-label="新しいパスワード"
            className={`w-52 ${SMALL_INPUT}`}
          />
          <button type="submit" className={SMALL_BUTTON}>
            再設定
          </button>
        </form>
        <form action={revokeMemberLogin}>
          <input type="hidden" name="id" value={employeeId} />
          <button
            type="submit"
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            ログインを取り消す
          </button>
        </form>
      </div>
    );
  }

  if (deptEmail) {
    return (
      <p className="text-xs text-neutral-500">
        {label}部署のアカウント（{deptEmail}）で「全社の1日」を使えます
      </p>
    );
  }

  if (!isActive) return null;

  return (
    <form
      action={issueMemberLogin}
      className="flex flex-wrap items-center gap-1 text-xs text-neutral-600"
    >
      <input type="hidden" name="id" value={employeeId} />
      {label}
      <span className="text-neutral-400">未発行</span>
      <input
        type="email"
        name="email"
        required
        autoComplete="off"
        placeholder="メールアドレス"
        aria-label="ログインに使うメールアドレス"
        className={`w-52 ${SMALL_INPUT}`}
      />
      <input
        type="text"
        name="password"
        required
        minLength={8}
        autoComplete="off"
        placeholder="初期パスワード（8文字以上）"
        aria-label="初期パスワード"
        className={`w-48 ${SMALL_INPUT}`}
      />
      <button type="submit" className={SMALL_BUTTON}>
        ログインを発行
      </button>
    </form>
  );
}
