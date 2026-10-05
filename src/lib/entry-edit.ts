/**
 * 予定の表（日・週・月）や一覧で予定を押したときに、編集の欄（components/entry-editor.tsx）を開く合図。
 * 押した側（components/entry-button.tsx）が送り、編集の欄が受け取る。quick-add.ts と同じく、
 * ページを読み込み直さずにその場で開くため、ブラウザの中のイベントでやり取りする。
 */
export const ENTRY_EDIT_EVENT = "schedule:entry-edit";

export type EditTarget = {
  /** event＝全体スケジュールの予定、block＝自分の予定（ブロック枠）、google＝本人の Google カレンダーの予定 */
  kind: "event" | "block" | "google";
  id: string;
  date: string;
  /** 0時からの分 */
  start: number;
  end: number;
  /** 件名。Google で件名を出さない設定のときは分からないので null（空のまま保存すると件名は変わらない） */
  title: string | null;
  /** 全体スケジュールの予定の「私用」 */
  isPrivate?: boolean;
  /** 全社管理者がほかの人の予定を直すときの、その人の名前 */
  who?: string;
  /** 日時・件名を直せない理由（何日にもまたがる Google の予定など）。消すことはできる */
  lockedReason?: string;
  /** 直すことも消すこともできない理由（Google の書き換えの許可が無いなど） */
  readOnlyReason?: string;
};

export function sendEntryEdit(target: EditTarget): void {
  window.dispatchEvent(new CustomEvent<EditTarget>(ENTRY_EDIT_EVENT, { detail: target }));
}

/** 合図を受け取る。戻り値は受け取りをやめる関数（useEffect の片付けに使う） */
export function onEntryEdit(handler: (target: EditTarget) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<EditTarget>).detail);
  window.addEventListener(ENTRY_EDIT_EVENT, listener);
  return () => window.removeEventListener(ENTRY_EDIT_EVENT, listener);
}

/** Google の予定を直せないときの案内（書き換えの許可が無い／何日にもまたがる） */
export const GOOGLE_NEEDS_RECONNECT =
  "Google の予定をここで直すには、アカウント情報で Google をつなぎ直してください（書き換えの許可をもらうため）。";
export const GOOGLE_SPANS_DAYS =
  "何日にもまたがる予定は、ここでは日時を直せません（Google カレンダーで直してください）。消すことはできます。";

/** 本人の Google の予定1件から、直す欄の中身を作る。ID の無い予定（古い控え）は直せないので undefined */
export function googleEditTarget(
  g: { id?: string; editable?: boolean; title: string | null },
  where: { date: string; start: number; end: number },
  canEdit: boolean,
): EditTarget | undefined {
  if (!g.id) return undefined;
  return {
    kind: "google",
    id: g.id,
    ...where,
    title: g.title,
    readOnlyReason: canEdit ? undefined : GOOGLE_NEEDS_RECONNECT,
    lockedReason: g.editable ? undefined : GOOGLE_SPANS_DAYS,
  };
}
