/**
 * 予定の表（週・1日）の空いているところを押したときに、上の「＋ 予定を追加」の欄へ日付・時刻を渡す合図。
 * 押した側（components/tap-to-add-layer.tsx）が送り、入力欄（add-entry-panel.tsx・time-range-fields.tsx）が受け取る。
 * ページを読み込み直さずにその場で入力欄を開くため、ブラウザの中のイベントでやり取りする。
 */
export const QUICK_ADD_EVENT = "schedule:quick-add";

export type QuickAddDetail = {
  date: string;
  /** 開始（0時からの分） */
  start: number;
  /** 全体スケジュールで、誰の予定にするか（全社管理者がほかの人の列を押したとき） */
  employeeId?: string;
};

export function sendQuickAdd(detail: QuickAddDetail): void {
  window.dispatchEvent(new CustomEvent<QuickAddDetail>(QUICK_ADD_EVENT, { detail }));
}

/** 合図を受け取る。戻り値は受け取りをやめる関数（useEffect の片付けに使う） */
export function onQuickAdd(handler: (detail: QuickAddDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<QuickAddDetail>).detail);
  window.addEventListener(QUICK_ADD_EVENT, listener);
  return () => window.removeEventListener(QUICK_ADD_EVENT, listener);
}
