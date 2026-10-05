"use client";

import { useEffect, useRef, useState } from "react";
import { onQuickAdd } from "@/lib/quick-add";
import { hm, toHm } from "@/lib/time";
import {
  ALL_DAY,
  ALL_DAY_TITLES,
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
 *
 * 「終日」は 0:00〜24:00 にする。titleName を渡すと「休み」「対応不可」のボタンも出し、
 * 押すと同じフォームの件名の欄（name が titleName）に入れて終日にする。
 */
export function TimeRangeFields({ defaultStart, titleName }: { defaultStart: number; titleName?: string }) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => defaultEnd(defaultStart));
  const length = end - start;
  const allDay = start === ALL_DAY.start && end === ALL_DAY.end;
  const ref = useRef<HTMLDivElement>(null);

  function setAllDay() {
    setStart(ALL_DAY.start);
    setEnd(ALL_DAY.end);
  }

  function fillTitle(title: string) {
    setAllDay();
    const input = ref.current?.closest("form")?.elements.namedItem(titleName ?? "");
    if (input instanceof HTMLInputElement) input.value = title;
  }

  // 予定の表の空いているところが押されたら、その時刻から1時間にする（quick-add.ts）
  useEffect(
    () =>
      onQuickAdd(({ start: next }) => {
        if (next === undefined) return;
        setStart(next);
        setEnd(defaultEnd(next));
      }),
    [],
  );

  const selectClass = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm";
  const chipClass = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs ${
      active
        ? "border-neutral-800 bg-neutral-800 text-white"
        : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
    }`;

  return (
    <div ref={ref} className="flex flex-wrap items-end gap-2">
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
              className={chipClass(active)}
            >
              {len === 90 ? "1時間半" : lengthLabel(len)}
            </button>
          );
        })}
        <button type="button" onClick={setAllDay} aria-pressed={allDay} className={chipClass(allDay)}>
          終日
        </button>
      </div>
      {titleName && (
        <div className="flex items-center gap-1 pb-0.5">
          <span className="text-xs text-neutral-500">1日まるごと：</span>
          {ALL_DAY_TITLES.map((title) => (
            <button
              key={title}
              type="button"
              onClick={() => fillTitle(title)}
              className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100"
            >
              {title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 一覧の見出しは先頭の0を付けない（9:00、24:00） */
function label(minutes: number): string {
  return toHm(minutes).replace(/^0(\d)/, "$1");
}
