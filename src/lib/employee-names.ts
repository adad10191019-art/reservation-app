/**
 * 社員名簿の名前まわりの小さな判断（DB を使わないのでテストしやすいよう分けている）。
 */

/**
 * 同じ人かどうかを名前で比べるための形にそろえる。
 * 「竹内 太郎」「竹内　太郎」「竹内太郎」を同じとみなす（空白の有無・全角半角の違いを無視）。
 */
export function normalizeEmployeeName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "");
}

/** 在籍中の社員の中に、同じ名前の人がいればその人を返す（except は自分自身を除くため） */
export function findSameNameEmployee<T extends { id: string; name: string; isActive: boolean }>(
  employees: T[],
  name: string,
  exceptId?: string,
): T | undefined {
  const key = normalizeEmployeeName(name);
  return employees.find(
    (e) => e.isActive && e.id !== exceptId && normalizeEmployeeName(e.name) === key,
  );
}

/**
 * ひも付け先のプルダウンに出す表示。同じ名前の人を見分けられるよう所属部署を添える。
 * 例：「竹内（就活のイロハ・youth光回線案内）」「事務 花子（部署なし）」
 */
export function employeeOptionLabel(name: string, tenantNames: string[]): string {
  const unique = [...new Set(tenantNames)];
  return `${name}（${unique.length > 0 ? unique.join("・") : "部署なし"}）`;
}
