/**
 * 「担当部署」のチェック欄（追加と1人の画面で共通）。
 * チェックした部署ごとに役割（オーナー／一般）を選ぶ。
 * 触れない部署（オーナーから見たほかの部署）は、字だけで出す。
 */
export function DeptChecks({
  tenants,
  managedIds,
  current,
  ownTenantOnly,
}: {
  tenants: { id: string; name: string }[];
  managedIds: string[];
  /** 今メンバーになっている部署と役割（役割が無い＝ログインの担当が付いていない） */
  current: { tenantId: string; role: string | null }[];
  /** オーナーの追加画面：今の部署に必ず登録するので、チェックではなく字で出す */
  ownTenantOnly?: boolean;
}) {
  const others = current.filter((c) => !managedIds.includes(c.tenantId));
  const nameOf = (id: string) => tenants.find((t) => t.id === id)?.name ?? "";

  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-neutral-600">担当部署</legend>
      <div className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {tenants
          .filter((t) => managedIds.includes(t.id))
          .map((t) => {
            const now = current.find((c) => c.tenantId === t.id);
            return (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2">
                {ownTenantOnly ? (
                  <>
                    <input type="hidden" name="tenantIds" value={t.id} />
                    <span className="flex-1 text-sm">{t.name} に登録します</span>
                  </>
                ) : (
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="tenantIds"
                      value={t.id}
                      defaultChecked={Boolean(now)}
                      className="size-5 shrink-0"
                    />
                    <span className="truncate">{t.name}</span>
                  </label>
                )}
                <select
                  name={`role_${t.id}`}
                  defaultValue={now?.role === "owner" ? "owner" : "staff"}
                  aria-label={`${t.name} での役割`}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                >
                  <option value="staff">一般</option>
                  <option value="owner">オーナー</option>
                </select>
              </div>
            );
          })}
      </div>
      {!ownTenantOnly && (
        <p className="mt-1 text-xs text-neutral-500">
          どこにもチェックしない人は、「全社の1日」だけを使う人になります。
        </p>
      )}
      {others.length > 0 && (
        <p className="mt-1 text-xs text-neutral-500">
          ほかに：{others.map((o) => nameOf(o.tenantId)).join("・")}（全社管理者が変えます）
        </p>
      )}
    </fieldset>
  );
}
