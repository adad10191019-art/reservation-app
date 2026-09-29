"use client";

/**
 * カレンダーの日表示グリッド。予約ブロックをドラッグして、
 * 時間や担当を変更できるようにする（消して登録し直すより速い）。
 *
 * ブロック枠（自分の私用予定・会議など）はドラッグ対象にしない。
 * 見た目の色（琥珀色・破線）もそのままにして、
 * 「これは予約ではなく個人の予定」と一目で区別できるようにしている。
 */
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveReservationByDrag } from "@/lib/calendar-actions";
import { canManageStaffReservation, type Actor } from "@/lib/permissions";
import { subtract, toHm, type Interval } from "@/lib/time";

type Reservation = {
  id: string;
  staffId: string;
  startMinutes: number;
  endMinutes: number;
  menuName: string;
  customerName: string;
};

type Block = {
  id: string;
  startMinutes: number;
  endMinutes: number;
  reason: string;
  wholeShop: boolean;
};

type Column = {
  staffId: string;
  staffName: string;
  working: Interval[];
  reservations: Reservation[];
  blocks: Block[];
};

const PX_PER_MIN = 1.4;

export function DayCalendarGrid({
  date,
  columns,
  viewStart,
  viewEnd,
  slotMinutes,
  actor,
}: {
  date: string;
  columns: Column[];
  viewStart: number;
  viewEnd: number;
  slotMinutes: number;
  /** 今ログインしている人。関数はサーバー→クライアントに渡せないので、
   * 判定に必要な素のデータだけを受け取り、判定はこちらで行う */
  actor: Actor;
}) {
  const canDragReservation = (staffId: string) => canManageStaffReservation(actor, staffId);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStaffId, setDragOverStaffId] = useState<string | null>(null);
  const grabOffsetRef = useRef(0);
  const draggedDurationRef = useRef(0);

  const totalHeight = (viewEnd - viewStart) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = viewStart; m <= viewEnd; m += 60) hours.push(m);
  const top = (minutes: number) => (minutes - viewStart) * PX_PER_MIN;

  function handleDragStart(
    e: React.DragEvent<HTMLAnchorElement>,
    reservation: Reservation,
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    grabOffsetRef.current = e.clientY - rect.top;
    draggedDurationRef.current = reservation.endMinutes - reservation.startMinutes;
    setDraggingId(reservation.id);
    // ドラッグ中のゴースト画像を、リンクの既定表示のままにする
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", reservation.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverStaffId(null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, staffId: string) {
    e.preventDefault();
    setDragOverStaffId(null);

    const reservationId = draggingId;
    setDraggingId(null);
    if (!reservationId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const dropTop = e.clientY - rect.top - grabOffsetRef.current;
    const rawStart = viewStart + dropTop / PX_PER_MIN;
    const snapped = Math.round(rawStart / slotMinutes) * slotMinutes;
    const clamped = Math.min(
      Math.max(snapped, viewStart),
      viewEnd - draggedDurationRef.current,
    );

    setError(null);
    startTransition(async () => {
      const result = await moveReservationByDrag({
        reservationId,
        date,
        startMinutes: clamped,
        staffId,
      });
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  return (
    <div>
      {error && (
        <p
          role="alert"
          className="mb-3 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 text-red-400 hover:text-red-600"
          >
            閉じる
          </button>
        </p>
      )}

      <div
        className={`overflow-x-auto rounded-lg border border-neutral-200 bg-white ${isPending ? "opacity-60" : ""}`}
      >
        {/* スタッフ名の行 */}
        <div className="flex border-b border-neutral-200 bg-neutral-50">
          <div className="w-14 shrink-0" />
          {columns.map((col) => (
            <div
              key={col.staffId}
              className="min-w-32 flex-1 border-l border-neutral-200 px-2 py-2 text-center text-sm font-medium"
            >
              {col.staffName}
              {col.working.length === 0 && (
                <span className="ml-1 text-xs font-normal text-neutral-400">休</span>
              )}
            </div>
          ))}
        </div>

        {/* 時間帯の本体 */}
        <div className="flex">
          {/* 時刻の目盛り */}
          <div className="relative w-14 shrink-0" style={{ height: totalHeight }}>
            {hours.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-neutral-400"
                style={{ top: top(m) }}
              >
                {toHm(m)}
              </span>
            ))}
          </div>

          {columns.map((col) => {
            const closed = subtract([{ start: viewStart, end: viewEnd }], col.working);

            return (
              <div
                key={col.staffId}
                className={`relative min-w-32 flex-1 border-l transition-colors ${
                  dragOverStaffId === col.staffId
                    ? "border-l-sky-300 bg-sky-50/60"
                    : "border-l-neutral-200"
                }`}
                style={{ height: totalHeight }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStaffId !== col.staffId) setDragOverStaffId(col.staffId);
                }}
                onDragLeave={() => {
                  setDragOverStaffId((current) => (current === col.staffId ? null : current));
                }}
                onDrop={(e) => handleDrop(e, col.staffId)}
              >
                {closed.map((c) => (
                  <div
                    key={`${c.start}-${c.end}`}
                    className="absolute inset-x-0 bg-neutral-100"
                    style={{ top: top(c.start), height: (c.end - c.start) * PX_PER_MIN }}
                  />
                ))}

                {hours.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-x-0 border-t border-neutral-100"
                    style={{ top: top(m) }}
                  />
                ))}

                {col.blocks.map((b) => (
                  <div
                    key={b.id}
                    className="absolute inset-x-1 overflow-hidden rounded border border-dashed border-amber-400 bg-amber-50 px-1.5 py-1 text-xs leading-tight text-amber-900"
                    style={{
                      top: top(b.startMinutes),
                      height: (b.endMinutes - b.startMinutes) * PX_PER_MIN - 2,
                    }}
                  >
                    <div className="truncate font-medium">{b.reason}</div>
                    <div className="tabular-nums text-amber-700">
                      {toHm(b.startMinutes)}–{toHm(b.endMinutes)}
                    </div>
                  </div>
                ))}

                {col.reservations.map((r) => {
                  const draggable = canDragReservation(r.staffId);
                  return (
                    <Link
                      key={r.id}
                      href={`/reservations/${r.id}`}
                      title={
                        draggable
                          ? `${toHm(r.startMinutes)}–${toHm(r.endMinutes)} ${r.menuName} ${r.customerName}様（ドラッグで移動できます）`
                          : `${toHm(r.startMinutes)}–${toHm(r.endMinutes)} ${r.menuName} ${r.customerName}様`
                      }
                      draggable={draggable}
                      onDragStart={draggable ? (e) => handleDragStart(e, r) : undefined}
                      onDragEnd={draggable ? handleDragEnd : undefined}
                      onClick={(e) => {
                        // ドラッグの直後にクリック扱いで詳細画面へ飛ばないようにする
                        if (draggingId) e.preventDefault();
                      }}
                      className={`absolute inset-x-1 block overflow-hidden rounded border border-sky-300 bg-sky-100 px-1.5 py-1 text-xs leading-none shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-200 ${
                        draggable ? "cursor-grab active:cursor-grabbing" : ""
                      } ${draggingId === r.id ? "opacity-30" : ""}`}
                      style={{
                        top: top(r.startMinutes),
                        height: (r.endMinutes - r.startMinutes) * PX_PER_MIN - 2,
                      }}
                    >
                      <div className="truncate font-medium text-sky-900">{r.menuName}</div>
                      <div className="mt-0.5 tabular-nums text-sky-800">
                        {toHm(r.startMinutes)}–{toHm(r.endMinutes)}
                      </div>
                      <div className="mt-0.5 truncate text-sky-700">{r.customerName} 様</div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
