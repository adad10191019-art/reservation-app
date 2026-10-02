"use client";

import { useFormStatus } from "react-dom";

/**
 * フォーム送信中に見た目を変える送信ボタン。
 *
 * 通常の <button type="submit"> は、押してからサーバーの処理が終わるまで
 * 何も見た目が変わらない。特に予約のようにネットワークの往復が挟まる処理では
 * 「押せたのか分からず連打してしまう」事故につながる。
 * useFormStatus はこのボタンを含むフォームの送信中だけ pending が true になる。
 * confirmText を渡すと、送る前に確認を出す（消す操作など）。キャンセルなら送らない。
 */
export function SubmitButton({
  children,
  pendingText,
  className,
  confirmText,
}: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
  confirmText?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={confirmText ? (e) => { if (!window.confirm(confirmText)) e.preventDefault(); } : undefined}
      className={`${className} active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
