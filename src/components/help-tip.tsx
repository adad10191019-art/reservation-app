import type { ReactNode } from "react";

/**
 * 「？」を押したときだけ出る説明。画面に説明の文を並べず、見た目をすっきりさせるために使う。
 * details 要素なので、押せば開き、もう一度押せば閉じる（JavaScript なしで動く）。
 */
export function HelpTip({ label = "説明", children }: { label?: string; children: ReactNode }) {
  return (
    <details className="relative inline-block align-middle">
      <summary
        aria-label={label}
        className="flex size-5 cursor-pointer list-none items-center justify-center rounded-full bg-neutral-200 text-[11px] font-medium text-neutral-600 marker:content-none hover:bg-neutral-300"
      >
        ?
      </summary>
      <div className="absolute left-0 top-7 z-20 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-neutral-200 bg-white p-2.5 text-xs leading-relaxed font-normal text-neutral-600 shadow-lg">
        {children}
      </div>
    </details>
  );
}

/** サイドバーの「？ 使い方・色の見方」。押すとその場（サイドバーの中）に説明が開く */
export function SidebarHelp({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-md">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-700 marker:content-none hover:bg-neutral-100">
        <span className="flex size-5 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-medium text-neutral-600">
          ?
        </span>
        {title}
      </summary>
      <div className="space-y-2 px-3 pb-2 pt-1 text-xs leading-relaxed text-neutral-600">{children}</div>
    </details>
  );
}
