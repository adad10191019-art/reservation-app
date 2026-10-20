/**
 * 予約カレンダー（日・週）に誰の列を出すか。
 *
 *   ・開いたときは自分の列だけ。「全員を見る」（URL の all=1）を押したときだけ全員を出す
 *   ・対応メニューが1つも無く、表示している期間に予約も無い人は、全員を見るときも出さない
 *     （名前だけオーナーの人など。予約を受けないので空の列が並ぶだけになる）
 *   ・自分の列が無い人（予約担当でない全社管理者・メニューの無いオーナー）は、最初から全員
 *
 * DB を触らない判定だけを置く。
 */

export type CalendarScope = "mine" | "all";

export function parseCalendarScope(all: string | undefined): CalendarScope {
  return all === "1" ? "all" : "mine";
}

/** 日・週の切り替えや前後の移動のリンクに付ける、表示の範囲の続き */
export function scopeQuery(scope: CalendarScope): string {
  return scope === "all" ? "&all=1" : "";
}

export type ScopeCandidate = {
  staffId: string;
  /** 対応メニューがあるか（お客様から予約を受けるか） */
  takesBookings: boolean;
  /** 表示している期間に予約があるか */
  hasReservations: boolean;
};

export function pickVisibleStaff<T extends ScopeCandidate>(
  staffs: T[],
  viewerStaffId: string | null,
  scope: CalendarScope,
): {
  visible: T[];
  /** 実際に自分の列だけを出しているか（「全員を見る」のボタンを出すか） */
  showingMineOnly: boolean;
  /** 「自分だけ」に戻せるか（自分の列があるか） */
  hasOwnColumn: boolean;
} {
  const shown = staffs.filter((s) => s.takesBookings || s.hasReservations);
  const own = shown.filter((s) => s.staffId === viewerStaffId);
  const hasOwnColumn = own.length > 0;
  if (scope === "mine" && hasOwnColumn) {
    return { visible: own, showingMineOnly: true, hasOwnColumn };
  }
  return { visible: shown, showingMineOnly: false, hasOwnColumn };
}
