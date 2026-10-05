"use client";

import { type ReactNode, useState } from "react";
import { type QuickAddDetail, sendQuickAdd } from "@/lib/quick-add";
import { toHm } from "@/lib/time";
import { TAP_MINUTES, tappedStart } from "@/lib/time-choices";

/**
 * 予定の表の1列に重ねる、押せる面。空いているところを押すと、その日・その30分の時刻で
 * 上の「＋ 予定を追加」が開く。予定の枠はこの面より上に描くので、予定を押したときは今まで通り（詳細・×）。
 * パソコンではマウスを乗せた位置に「＋ 13:00」と出して、押すとどうなるかを見せる。
 */
export function TapToAddLayer({
  date,
  employeeId,
  rangeStart,
  pxPerMinute,
}: Omit<QuickAddDetail, "start"> & { rangeStart: number; pxPerMinute: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const startAt = (e: React.MouseEvent<HTMLDivElement>) =>
    tappedStart(e.clientY - e.currentTarget.getBoundingClientRect().top, rangeStart, pxPerMinute);

  return (
    <div
      className="absolute inset-0 cursor-pointer"
      title="空いているところを押すと、その時刻で予定を入力できます"
      onClick={(e) => sendQuickAdd({ date, start: startAt(e), employeeId })}
      onMouseMove={(e) => setHover(startAt(e))}
      onMouseLeave={() => setHover(null)}
    >
      {hover !== null && (
        <div
          className="pointer-events-none absolute inset-x-0.5 rounded border border-dashed border-emerald-400 bg-emerald-50/70 px-1 text-[11px] text-emerald-800"
          style={{ top: (hover - rangeStart) * pxPerMinute, height: TAP_MINUTES * pxPerMinute }}
        >
          ＋ {toHm(hover)}
        </div>
      )}
    </div>
  );
}

/**
 * 月のマス。押すとその日付で上の「＋ 予定を追加」が開く（時刻は入力欄のまま）。
 * 月を見ながら休みなどを続けて入れられるよう、ページは移らない。マスの中のリンク（日付の数字）は今まで通り開く。
 */
export function MonthDayCell({
  date,
  employeeId,
  className,
  children,
}: Omit<QuickAddDetail, "start"> & { className: string; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${Number(date.slice(5, 7))}月${Number(date.slice(8))}日の予定を入力する`}
      className={`cursor-pointer ${className}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        sendQuickAdd({ date, employeeId });
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        sendQuickAdd({ date, employeeId });
      }}
    >
      {children}
    </div>
  );
}
