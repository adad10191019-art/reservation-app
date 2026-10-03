"use client";

import type { ComponentProps } from "react";

/** 選んだらすぐ、入っているフォームを送る選択欄（全体スケジュールの週・月で人を切り替える） */
export function AutoSubmitSelect(props: Omit<ComponentProps<"select">, "onChange">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
