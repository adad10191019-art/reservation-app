/**
 * お客様が自分で予約を取れる範囲の判定。
 *
 *   ・何日先まで受けるか（bookingWindowDays）
 *   ・開始の何分前まで受けるか（bookingLeadMinutes）
 *
 * 店舗側の画面からは当日の直前でも入れられる必要があるため、
 * この制限はお客様向けの経路にだけ掛ける。
 *
 * DBを触らない純粋な計算。そのままテストできる。
 */

export type WindowCheck = { ok: true } | { ok: false; message: string };

/** "YYYY-MM-DD" と 0時からの経過分から、その時刻の Date を作る（ローカル時間） */
export function slotDateTime(date: string, startMinutes: number): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`日付の形式が不正です: ${date}`);
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Math.floor(startMinutes / 60),
    startMinutes % 60,
    0,
    0,
  );
}

export function checkBookingWindow(params: {
  date: string;
  startMinutes: number;
  windowDays: number;
  leadMinutes: number;
  now?: Date;
}): WindowCheck {
  const { date, startMinutes, windowDays, leadMinutes } = params;
  const now = params.now ?? new Date();

  const slot = slotDateTime(date, startMinutes);

  // 締め切り：開始の leadMinutes 前を過ぎていたら受けない
  const deadline = new Date(slot.getTime() - leadMinutes * 60 * 1000);
  if (now.getTime() > deadline.getTime()) {
    if (slot.getTime() <= now.getTime()) {
      return { ok: false, message: "過ぎた時間は予約できません" };
    }
    const hours = Math.floor(leadMinutes / 60);
    const label = hours >= 1 ? `${hours}時間` : `${leadMinutes}分`;
    return { ok: false, message: `開始の${label}前を過ぎているため、お電話でご相談ください` };
  }

  // 受付の上限：今日から windowDays 日後の終わりまで
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  limit.setDate(limit.getDate() + windowDays + 1); // 当日の終わりまで含める
  if (slot.getTime() >= limit.getTime()) {
    return { ok: false, message: `予約は${windowDays}日先までお受けしています` };
  }

  return { ok: true };
}

/** 空き枠の一覧から、お客様が選べるものだけを残す */
export function filterBookableStarts(
  starts: number[],
  params: { date: string; windowDays: number; leadMinutes: number; now?: Date },
): number[] {
  return starts.filter(
    (startMinutes) =>
      checkBookingWindow({
        date: params.date,
        startMinutes,
        windowDays: params.windowDays,
        leadMinutes: params.leadMinutes,
        now: params.now,
      }).ok,
  );
}
