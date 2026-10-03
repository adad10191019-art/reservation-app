/**
 * お客様が担当を指名しなかったときの振り分け方（booking-any-staff.ts から使う）。
 * DBもCookieも触らない純粋な処理なので、そのままテストできる。
 *
 * その時間に空いている人のうち、その日の予約がいちばん少ない人から順に試す。
 * 件数が同じ人どうしはくじ引きにする（並び順で決めると、上の人ばかりに入ってしまうため）。
 */

/** 担当の選ばせ方。"choose"＝選べる、"none"＝選ばせない（Tenant.staffSelection） */
export type StaffSelection = "choose" | "none";

export function parseStaffSelection(value: string | null | undefined): StaffSelection {
  return value === "none" ? "none" : "choose";
}

/**
 * 試す順に並べた担当者。
 * @param candidates その時間に空いている担当者
 * @param dayCounts  担当者ごとの、その日の予約件数（無ければ0件）
 * @param random     0以上1未満の数を返す関数（テストでは決まった値を渡す）
 */
export function orderByLoad(
  candidates: string[],
  dayCounts: Map<string, number>,
  random: () => number = Math.random,
): string[] {
  return candidates
    .map((staffId) => ({ staffId, count: dayCounts.get(staffId) ?? 0, lot: random() }))
    .sort((a, b) => a.count - b.count || a.lot - b.lot)
    .map((c) => c.staffId);
}
