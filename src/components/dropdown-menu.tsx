"use client";

import { useEffect, useRef } from "react";

/**
 * <details> を使った開閉メニュー。<details> だけだと、外をタップしても閉じず、
 * もう一度ボタンを押す必要がある。ここでは
 *   ・メニューの外をタップ／クリックしたとき
 *   ・Esc キーを押したとき
 *   ・メニューの中のリンク・ボタンを押したとき（設定画面のように、画面を移っても
 *     ヘッダーが描き直されない場合に開いたまま残らないように）
 * に閉じる。
 */
export function DropdownMenu({
  summary,
  summaryLabel,
  summaryClassName,
  className,
  children,
}: {
  summary: React.ReactNode;
  summaryLabel: string;
  summaryClassName: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => ref.current?.removeAttribute("open");
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={className}>
      <summary aria-label={summaryLabel} className={summaryClassName}>
        {summary}
      </summary>
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button")) ref.current?.removeAttribute("open");
        }}
      >
        {children}
      </div>
    </details>
  );
}
