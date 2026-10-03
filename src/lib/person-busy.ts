/**
 * 「人（社員）」として空いていない時間を、部署をまたいで集める。
 *
 * 兼任の人は、部署ごとに別のスタッフ（Staff）として登録されている。
 * それらは社員名簿（Employee）の同じ1行を指しているので、ある部署の空き枠を
 * 計算するときは、次のものも「空いていない時間」として足す。
 *   ・その人の予定（EmployeeEvent。どの部署から入れたものでも）
 *   ・兼任先の部署での、その人の予約とブロック枠
 *
 * 他部署のデータを読むのはこのファイルだけにする。
 * 返すのは「何時から何時まで」だけで、件名・お客様名・部署名は返さない。
 * DB から読むときも時刻の列だけを選び、他部署の中身がそもそも手元に来ないようにする。
 * Google カレンダーは人に付く連携なので、ここではなく availability.ts がその人の分として読む。
 *
 * 店舗全体のブロック枠（staffId が null）は他部署には持ち込まない。
 * 「その部署の受付を止める」ためのもので、その人が塞がっているとは限らないため。
 */
import { prisma } from "./prisma";
import type { Interval } from "./time";

/** トランザクションの中でも外でも使えるクライアント */
type Db = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** スタッフID → 日付 → 空いていない時間 */
export type BusyByStaff = Map<string, Map<string, Interval[]>>;

function push(map: BusyByStaff, staffId: string, date: string, interval: Interval) {
  let byDate = map.get(staffId);
  if (!byDate) {
    byDate = new Map();
    map.set(staffId, byDate);
  }
  const list = byDate.get(date);
  if (list) list.push(interval);
  else byDate.set(date, [interval]);
}

/**
 * 指定したスタッフそれぞれについて、部署をまたいだ「その人の」空いていない時間を返す。
 *
 * 呼び出し側の部署の中の予約・ブロック枠は含めない（呼び出し側がすでに見ているため）。
 * 名簿とひも付いていないスタッフは何も返さない（今まで通りの動き）。
 */
export async function fetchPersonBusy(
  db: Db,
  params: {
    staffIds: string[];
    dates: string[];
    /** 日時変更のとき、その予約自身で塞がって見えないようにする */
    excludeReservationId?: string;
  },
): Promise<BusyByStaff> {
  const { staffIds, dates, excludeReservationId } = params;
  const result: BusyByStaff = new Map();
  if (staffIds.length === 0 || dates.length === 0) return result;

  const staffs = await db.staff.findMany({
    where: { id: { in: staffIds }, employeeId: { not: null } },
    select: { id: true, employeeId: true },
  });
  if (staffs.length === 0) return result;

  const employeeIds = [...new Set(staffs.map((s) => s.employeeId!))];

  // 同じ社員を指す、ほかのスタッフ（＝兼任先の部署でのその人）
  const siblings = await db.staff.findMany({
    where: { employeeId: { in: employeeIds }, id: { notIn: staffIds } },
    select: { id: true, employeeId: true },
  });
  const siblingIds = siblings.map((s) => s.id);
  const employeeOfSibling = new Map(siblings.map((s) => [s.id, s.employeeId!]));

  // 時刻の列だけを読む。件名・お客様・部署はここで読まない
  const [events, reservations, blocks] = await Promise.all([
    db.employeeEvent.findMany({
      where: { employeeId: { in: employeeIds }, date: { in: dates } },
      select: { employeeId: true, date: true, startMinutes: true, endMinutes: true },
    }),
    siblingIds.length > 0
      ? db.reservation.findMany({
          where: {
            staffId: { in: siblingIds },
            date: { in: dates },
            status: "booked", // キャンセル済みは塞がない
            ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
          },
          select: { staffId: true, date: true, startMinutes: true, endMinutes: true },
        })
      : [],
    siblingIds.length > 0
      ? db.block.findMany({
          where: { staffId: { in: siblingIds }, date: { in: dates } },
          select: { staffId: true, date: true, startMinutes: true, endMinutes: true },
        })
      : [],
  ]);

  // 社員ごとにまとめてから、その社員を指す呼び出し側のスタッフに配る
  const byEmployee: BusyByStaff = new Map();
  for (const e of events) {
    push(byEmployee, e.employeeId, e.date, { start: e.startMinutes, end: e.endMinutes });
  }
  for (const r of [...reservations, ...blocks]) {
    const employeeId = employeeOfSibling.get(r.staffId!);
    if (employeeId) push(byEmployee, employeeId, r.date, { start: r.startMinutes, end: r.endMinutes });
  }

  for (const staff of staffs) {
    const byDate = byEmployee.get(staff.employeeId!);
    if (!byDate) continue;
    for (const [date, list] of byDate) {
      for (const interval of list) push(result, staff.id, date, interval);
    }
  }
  return result;
}

/** そのスタッフ（の中の人）が、その時間に部署をまたいで塞がっているか */
export async function isPersonBusy(
  db: Db,
  params: {
    staffId: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    excludeReservationId?: string;
  },
): Promise<boolean> {
  const busy = await fetchPersonBusy(db, {
    staffIds: [params.staffId],
    dates: [params.date],
    excludeReservationId: params.excludeReservationId,
  });
  const list = busy.get(params.staffId)?.get(params.date) ?? [];
  // 「既存の開始 < 新規の終了」かつ「新規の開始 < 既存の終了」なら重なっている
  return list.some((b) => b.start < params.endMinutes && params.startMinutes < b.end);
}
