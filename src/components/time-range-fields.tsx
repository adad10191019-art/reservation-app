"use client";

import { useState } from "react";
import { hm, toHm } from "@/lib/time";
import {
  LENGTH_CHOICES,
  defaultEnd,
  endChoices,
  endFor,
  lengthLabel,
  startChoices,
} from "@/lib/time-choices";

/**
 * 予定の開始・終了を選ぶ欄（name="start" / name="end" に "HH:MM" を入れて送る）。
 *
 * ブラウザ標準の時刻欄は Android だと時計型・キーボード型になり、分を1つずつ合わせるのが面倒なので、
 * 15分刻みの一覧と「30分」「1時間」などのボタンにしている。開始を変えても長さは保つ（終了も一緒にずれる）。
 */
export function TimeRangeFields({ defaultStart }: { defaultStart: number }) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => defaultEnd(defaultStart));
  const length = end - start;

  const selectClass = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-600">開始</span>
        <select
          name="start"
          value={toHm(start)}
          onChange={(e) => {
            const next = hm(e.target.value);
            setStart(next);
            setEnd(endFor(next, length));
          }}
          className={selectClass}
        >
          {startChoices().map((m) => (
            <option key={m} value={toHm(m)}>
              {label(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-600">終了</span>
        <select
          name="end"
          value={toHm(end)}
          onChange={(e) => setEnd(hm(e.target.value))}
          className={selectClass}
        >
          {endChoices(start).map((m) => (
            <option key={m} value={toHm(m)}>
              {label(m)}（{lengthLabel(m - start)}）
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-1 pb-0.5">
        {LENGTH_CHOICES.map((len) => {
          const active = length === len;
          return (
            <button
              key={len}
              type="button"
              onClick={() => setEnd(endFor(start, len))}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                active
                  ? "border-neutral-800 bg-neutral-800 text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {len === 90 ? "1時間半" : lengthLabel(len)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 一覧の見出しは先頭の0を付けない（9:00、24:00） */
function label(minutes: number): string {
  return toHm(minutes).replace(/^0(\d)/, "$1");
}
