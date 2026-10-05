"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { onQuickAdd } from "@/lib/quick-add";

/**
 * 予定を足す欄。ふだんは緑の「＋ 追加」のボタンだけにして、押すと入力欄が開く
 * （スマホで入力欄が予定の表を下へ押し出さないように）。details 要素なので、押せばすぐ開く。
 *
 * 予定の表の空いているところが押されたら（quick-add.ts の合図）、ここを開いて日付・誰の予定を入れ、
 * 入力欄まで画面を戻して件名の欄にカーソルを置く（時刻は time-range-fields.tsx が自分で受け取る）。
 */
export function AddEntryPanel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(
    () =>
      onQuickAdd(({ date, employeeId, start }) => {
        const panel = ref.current;
        if (!panel) return;
        panel.open = true;
        const dateInput = panel.querySelector<HTMLInputElement>('input[name="date"]');
        if (dateInput) dateInput.value = date;
        const who = panel.querySelector<HTMLSelectElement>('select[name="employeeId"]');
        if (who && employeeId) who.value = employeeId;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        // 月のマスから開いたときは「休み」などのボタンで済むことが多いので、スマホのキーボードを出さない
        if (start !== undefined) {
          panel.querySelector<HTMLInputElement>('input[type="text"]')?.focus({ preventScroll: true });
        }
      }),
    [],
  );

  return (
    <details ref={ref} className="group mb-4 scroll-mt-4 rounded-lg open:border open:border-neutral-200 open:bg-white open:p-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white marker:content-none hover:bg-emerald-700 group-open:mb-3 group-open:bg-transparent group-open:px-0 group-open:py-0 group-open:text-neutral-600 group-open:hover:bg-transparent group-open:hover:text-neutral-900">
        <span className="group-open:hidden">＋ 追加</span>
        <span className="hidden group-open:inline">× 閉じる</span>
      </summary>
      {children}
    </details>
  );
}
