"use client";

/**
 * カレンダーの週表示。予約カードをドラッグして、別の日・別の担当へ
 * 動かせるようにする（日表示と違って一覧表示なので、時刻はそのまま保つ）。
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveReservationByDrag } from "@/lib/calendar-actions";
import { canManageStaffReservation, type Actor } from "@/lib/permissions";
import { dayOfWeekOf } from "@/lib/time";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

type WeekReservation = {
  id: string;
  staffId: string;
  startMinutes: number;
  endMinutes: number;
  customerName: string;
  createdAt: Date;
  updatedAt: Date;
};

type WeekDayCell = {
  date: string;
  isOff: boolean;
  reservations: WeekReservation[];
};

type WeekStaffRow = {
  staffId: string;
  staffName: string;
  days: WeekDayCell[];
};

const RECENTLY_MOVED_MS = 30 * 60 * 1000;

function toHmShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function WeekCalendarGrid({
  dates,
  staffRows,
  today,
  actor,
}: {
  dates: string[];
  staffRows: WeekStaffRow[];
  today: string;
  actor: Actor;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    startMinutes: number;
    fromStaffId: string;
    fromDate: string;
  } | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  function handleDrop(staffId: string, date: string) {
    setDragOverCell(null);
    const current = dragging;
    setDragging(null);
    if (!current) return;
    if (current.fromStaffId === staffId && current.fromDate === date) return;

    setError(null);
    startTransition(async () => {
      const result = await moveReservationByDrag({
        reservationId: current.id,
        date,
        startMinutes: current.startMinutes,
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
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="w-28 shrink-0 border-r border-neutral-200 px-3 py-2 text-left font-medium text-neutral-600">
                スタッフ
              </th>
              {dates.map((date) => {
                const isToday = date === today;
                const [, , d] = date.split("-");
                return (
                  <th
                    key={date}
                    className={`min-w-32 border-l border-neutral-200 px-2 py-2 text-center font-medium ${
                      isToday ? "bg-sky-50 text-sky-800" : "text-neutral-600"
                    }`}
                  >
                    <Link href={`/calendar?date=${date}`} className="hover:underline">
                      {Number(d)}日({WEEKDAY_JA[dayOfWeekOf(date)]})
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {staffRows.map((row) => (
              <tr key={row.staffId} className="border-b border-neutral-100 last:border-b-0">
                <td className="border-r border-neutral-200 px-3 py-2 align-top font-medium">
                  {row.staffName}
                </td>
                {row.days.map((day) => {
                  const cellKey = `${row.staffId}-${day.date}`;
                  return (
                    <td
                      key={day.date}
                      className={`border-l border-neutral-200 px-2 py-2 align-top transition-colors ${
                        day.isOff ? "bg-neutral-50" : ""
                      } ${dragOverCell === cellKey ? "bg-sky-50" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverCell !== cellKey) setDragOverCell(cellKey);
                      }}
                      onDragLeave={() => {
                        setDragOverCell((c) => (c === cellKey ? null : c));
                      }}
                      onDrop={() => handleDrop(row.staffId, day.date)}
                    >
                      {day.isOff ? (
                        <span className="text-xs text-neutral-400">休</span>
                      ) : day.reservations.length === 0 ? (
                        <span className="text-xs text-neutral-300">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {day.reservations.map((r) => {
                            const draggable = canManageStaffReservation(actor, r.staffId);
                            const wasModified =
                              new Date(r.updatedAt).getTime() > new Date(r.createdAt).getTime();
                            const justMoved =
                              wasModified &&
                              Date.now() - new Date(r.updatedAt).getTime() < RECENTLY_MOVED_MS;
                            return (
                              <li key={r.id}>
                                <Link
                                  href={`/reservations/${r.id}`}
                                  draggable={draggable}
                                  onDragStart={
                                    draggable
                                      ? () =>
                                          setDragging({
                                            id: r.id,
                                            startMinutes: r.startMinutes,
                                            fromStaffId: row.staffId,
                                            fromDate: day.date,
                                          })
                                      : undefined
                                  }
                                  onDragEnd={() => setDragging(null)}
                                  onClick={(e) => {
                                    if (dragging) e.preventDefault();
                                  }}
                                  title={justMoved ? "直前に移動されました" : undefined}
                                  className={`block rounded border px-1.5 py-1 text-xs leading-tight ${
                                    justMoved
                                      ? "border-amber-400 bg-sky-50 ring-2 ring-amber-400"
                                      : "border-sky-200 bg-sky-50 hover:border-sky-400 hover:bg-sky-100"
                                  } ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${
                                    dragging?.id === r.id ? "opacity-30" : ""
                                  }`}
                                >
                                  <span className="tabular-nums font-medium text-sky-900">
                                    {toHmShort(r.startMinutes)}
                                  </span>
                                  <span className="ml-1 truncate text-sky-800">
                                    {r.customerName}様
                                  </span>
                                  {justMoved && (
                                    <span className="ml-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold text-white">
                                      移動済
                                    </span>
                                  )}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
