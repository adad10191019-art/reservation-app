"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { onQuickAdd } from "@/lib/quick-add";

/**
 * 予定を足す欄。ふだんは「＋ 予定を追加」のボタンだけにして、押すと入力欄が開く
 * （スマホで入力欄が予定の表を下へ押し出さないように）。details 要素なので、押せばすぐ開く。
 *
 * 予定の表の空いているところが押されたら（quick-add.ts の合図）、ここを開いて日付・誰の予定を入れ、
 * 入力欄まで画面を戻して件名の欄にカーソルを置く（時刻は time-range-fields.tsx が自分で受け取る）。
 */
export function AddEntryPanel({ label = "予定を追加", children }: { label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(
    () =>
      onQuickAdd(({ date, employeeId }) => {
        const panel = ref.current;
        if (!panel) return;
        panel.open = true;
        const dateInput = panel.querySelector<HTMLInputElement>('input[name="date"]');
        if (dateInput) dateInput.value = date;
        const who = panel.querySelector<HTMLSelectElement>('select[name="employeeId"]');
        if (who && employeeId) who.value = employeeId;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        panel.querySelector<HTMLInputElement>('input[type="text"]')?.focus({ preventScroll: true });
      }),
    [],
  );

  return (
    <details ref={ref} className="group mb-4 scroll-mt-4 rounded-lg border border-neutral-200 bg-white open:p-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 marker:content-none hover:bg-emerald-50 group-open:mb-2 group-open:px-0 group-open:py-0 group-open:hover:bg-transparent">
        <span className="text-base leading-none group-open:hidden">＋</span>
        <span className="hidden text-base leading-none group-open:inline">−</span>
        {label}
        <span className="text-xs font-normal text-neutral-500 group-open:hidden">
          （押すと入力欄が開きます。表の空いているところを押しても開けます）
        </span>
        <span className="hidden text-xs font-normal text-neutral-500 group-open:inline">（押すと閉じます）</span>
      </summary>
      {children}
    </details>
  );
}
