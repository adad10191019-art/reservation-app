"use client";

import { useEffect, useState } from "react";
import type { CustomerCandidate } from "@/lib/customer-search";

/** 打ち終わるのを待ってから探す（1文字ごとに問い合わせない） */
const DEBOUNCE_MS = 250;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; customers: CustomerCandidate[]; more: boolean }
  | { status: "error" };

/**
 * 予約登録画面の「既存の顧客から選ぶ」欄。
 *
 * 名前・電話番号・メールの一部を入れると候補が出て、押すと選ばれる。
 * 選んだ顧客のIDは、フォームの customerId として送られる。
 * 何も選ばなければ customerId は空になり、新規のお客様として登録される。
 */
export function CustomerPicker({ name = "customerId" }: { name?: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerCandidate | null>(null);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });

  useEffect(() => {
    const q = query.trim();
    if (selected || !q) return;

    // 打ち続けている間の古い問い合わせは捨てる（遅れて届いた結果で上書きしない）
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch({ status: "loading" });
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: { customers: CustomerCandidate[]; more: boolean } = await res.json();
        setSearch({ status: "done", ...data });
      } catch {
        if (!controller.signal.aborted) setSearch({ status: "error" });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm">
        <input type="hidden" name={name} value={selected.id} />
        <span>
          <span className="font-medium">{selected.name}</span>
          {selected.phone && <span className="text-neutral-500">（{selected.phone}）</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setSearch({ status: "idle" });
            setQuery("");
          }}
          className="shrink-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50"
        >
          選び直す
        </button>
      </div>
    );
  }

  const q = query.trim();

  return (
    <div>
      <input type="hidden" name={name} value="" />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!e.target.value.trim()) setSearch({ status: "idle" });
        }}
        // Enter でフォームごと送信されないようにする（予約が意図せず確定するのを防ぐ）
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder="名前・電話番号・メールの一部で検索"
        autoComplete="off"
        aria-label="既存の顧客を検索"
        className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
      />

      {q && (
        <div className="mt-2 rounded-md border border-neutral-200" aria-live="polite">
          {search.status === "loading" && (
            <p className="px-3 py-2 text-xs text-neutral-500">検索しています…</p>
          )}
          {search.status === "error" && (
            <p className="px-3 py-2 text-xs text-red-700">
              検索できませんでした。時間をおいて、もう一度お試しください。
            </p>
          )}
          {search.status === "done" && search.customers.length === 0 && (
            <p className="px-3 py-2 text-xs text-neutral-500">
              見つかりませんでした。新規のお客様なら、下の欄にお名前を入れてください。
            </p>
          )}
          {search.status === "done" && search.customers.length > 0 && (
            <ul className="max-h-60 divide-y divide-neutral-100 overflow-y-auto">
              {search.customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    {c.name}
                    {c.phone && <span className="text-neutral-500">（{c.phone}）</span>}
                  </button>
                </li>
              ))}
              {search.more && (
                <li className="px-3 py-2 text-xs text-neutral-500">
                  ほかにも該当があります。もう少し詳しく入れて絞り込んでください。
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
