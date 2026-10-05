"use client";

import type { CSSProperties, ReactNode } from "react";
import { type EditTarget, sendEntryEdit } from "@/lib/entry-edit";

/** 押すと、その予定を直す・消す欄（entry-editor.tsx）が開く予定の枠 */
export function EntryButton({
  target,
  className,
  style,
  title,
  children,
}: {
  target: EditTarget;
  className: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-entry
      title={title}
      style={style}
      className={`cursor-pointer text-left hover:brightness-95 ${className}`}
      onClick={(e) => {
        // 月のマス（押すと追加の欄が開く）にまで伝わらないように
        e.stopPropagation();
        sendEntryEdit(target);
      }}
    >
      {children}
    </button>
  );
}
