/**
 * 「全体スケジュール」で、1人分の列に何をどう見せるかを決める。
 *
 * この画面は社員全員が見られるので、見せ方の判断をここに集める。
 * DBもCookieも触らない純粋な処理なので、そのままテストできる。
 *
 *   ・社員の予定 … 件名を出す。ただし私用（isPrivate）は本人以外には「予定あり」だけ
 *   ・予約       … 「予約（部署名）」だけ。お客様名・メニューは出さない
 *   ・ブロック枠 … 件名（会議・研修など）と部署名を出す（ユーザーと合意済み 2026-10-01）
 *   ・Google の予定 … 本人が「件名を出す」にしていれば件名、そうでなければ「予定あり」
 *                    （件名を出すかは取ってくる時点で決まっていて、title が null なら出さない）
 */
import { type Interval, toHm } from "./time";

export type TeamViewer = {
  /** 見ている人が名簿のどの社員か。名簿とひも付いていなければ null */
  employeeId: string | null;
  /** 全社管理者（他の人の予定も代わりに入れ・消しできる） */
  isAdmin: boolean;
};

export type TeamItem = {
  key: string;
  kind: "event" | "reservation" | "block" | "google";
  startMinutes: number;
  endMinutes: number;
  label: string;
  /** 補足（部署名・私用の印など） */
  note: string | null;
  /** 削除できる社員の予定なら、そのID */
  deletableEventId: string | null;
};

export type TeamColumn = {
  employeeId: string;
  name: string;
  /** スタッフとして属している部署の名前 */
  departments: string[];
  isMe: boolean;
  items: TeamItem[];
};

export type TeamSource = {
  employees: { id: string; name: string }[];
  /** 名簿とひも付いたスタッフ（どの社員の、どの部署のスタッフか） */
  staffs: { id: string; employeeId: string; tenantName: string }[];
  events: {
    id: string;
    employeeId: string;
    startMinutes: number;
    endMinutes: number;
    title: string;
    isPrivate: boolean;
  }[];
  reservations: { id: string; staffId: string; startMinutes: number; endMinutes: number }[];
  blocks: { id: string; staffId: string; startMinutes: number; endMinutes: number; reason: string }[];
  /** 連携している Google カレンダーの予定（google-calendar-cache.ts） */
  googleEvents: { employeeId: string; startMinutes: number; endMinutes: number; title: string | null }[];
};

const DAY_END = 24 * 60;

/** 終日の予定（0:00〜24:00）。表示の範囲を広げる元にはしない */
export function isAllDay(item: { startMinutes: number; endMinutes: number }): boolean {
  return item.startMinutes === 0 && item.endMinutes === DAY_END;
}

/** 時間の表示。終日なら「終日」、それ以外は「9:00–10:00」 */
export function timeRangeText(item: { startMinutes: number; endMinutes: number }): string {
  return isAllDay(item) ? "終日" : `${toHm(item.startMinutes)}–${toHm(item.endMinutes)}`;
}

export function buildTeamColumns(source: TeamSource, viewer: TeamViewer): TeamColumn[] {
  const staffById = new Map(source.staffs.map((s) => [s.id, s]));

  return source.employees.map((employee) => {
    const isMe = viewer.employeeId === employee.id;
    const departments = [
      ...new Set(source.staffs.filter((s) => s.employeeId === employee.id).map((s) => s.tenantName)),
    ];

    const items: TeamItem[] = [];

    for (const e of source.events) {
      if (e.employeeId !== employee.id) continue;
      const hidden = e.isPrivate && !isMe;
      items.push({
        key: `event-${e.id}`,
        kind: "event",
        startMinutes: e.startMinutes,
        endMinutes: e.endMinutes,
        label: hidden ? "予定あり" : e.title,
        note: e.isPrivate && isMe ? "私用（他の人には件名を隠しています）" : null,
        deletableEventId: isMe || viewer.isAdmin ? e.id : null,
      });
    }

    for (const r of source.reservations) {
      const staff = staffById.get(r.staffId);
      if (!staff || staff.employeeId !== employee.id) continue;
      items.push({
        key: `reservation-${r.id}`,
        kind: "reservation",
        startMinutes: r.startMinutes,
        endMinutes: r.endMinutes,
        label: "予約",
        note: staff.tenantName,
        deletableEventId: null,
      });
    }

    for (const b of source.blocks) {
      const staff = staffById.get(b.staffId);
      if (!staff || staff.employeeId !== employee.id) continue;
      items.push({
        key: `block-${b.id}`,
        kind: "block",
        startMinutes: b.startMinutes,
        endMinutes: b.endMinutes,
        label: b.reason,
        note: staff.tenantName,
        deletableEventId: null,
      });
    }

    source.googleEvents.forEach((g, index) => {
      if (g.employeeId !== employee.id) return;
      const allDay = isAllDay(g);
      items.push({
        key: `google-${employee.id}-${index}`,
        kind: "google",
        startMinutes: g.startMinutes,
        endMinutes: g.endMinutes,
        label: g.title ?? "予定あり",
        note: allDay ? "終日（Googleカレンダー）" : "Googleカレンダー",
        deletableEventId: null,
      });
    });

    items.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
    return { employeeId: employee.id, name: employee.name, departments, isMe, items };
  });
}

/**
 * 同じ列の中で時間が重なる項目を、横に並べて描くための段（0始まり）と段数を決める。
 * 重なりの塊ごとに段数を数えるので、重ならない項目は列の幅いっぱいに描ける。
 */
export function layoutLanes<T extends { startMinutes: number; endMinutes: number }>(
  items: T[],
): { item: T; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes);
  const out: { item: T; lane: number; lanes: number }[] = [];

  let group: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;

  const flush = () => {
    for (const g of group) g.lanes = laneEnds.length;
    out.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (group.length > 0 && item.startMinutes >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMinutes);
    } else {
      laneEnds[lane] = item.endMinutes;
    }
    group.push({ item, lane, lanes: 0 });
    groupEnd = Math.max(groupEnd, item.endMinutes);
  }
  if (group.length > 0) flush();
  return out;
}

/** 表示する時間の範囲。予定が無ければ 9:00〜19:00 */
export function teamViewRange(columns: TeamColumn[]): Interval {
  return timeRangeOf(columns.flatMap((c) => c.items));
}

/** 並べる項目すべてが入る時間の範囲（1時間単位）。終日の予定では広げない。予定が無ければ 9:00〜19:00 */
export function timeRangeOf(items: { startMinutes: number; endMinutes: number }[]): Interval {
  const points = items.filter((i) => !isAllDay(i)).flatMap((i) => [i.startMinutes, i.endMinutes]);
  const start = Math.min(9 * 60, ...points);
  const end = Math.max(19 * 60, ...points);
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
}
