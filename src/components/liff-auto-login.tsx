"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    liff?: {
      init: (config: { liffId: string }) => Promise<void>;
      isInClient: () => boolean;
      isLoggedIn: () => boolean;
      login: () => void;
      getIDToken: () => string | null;
    };
  }
}

/**
 * LINEアプリの中（LIFF）で開かれたときだけ、自動でログインさせる。
 *
 * LINEアプリの外（ふつうのブラウザ）で開かれた場合は何もしない
 * （その場合は、この下に表示される通常のログイン欄を使ってもらう）。
 *
 * next/script の onReady は「読み込み済みのときも含めて、このコンポーネントが
 * 画面に出るたびに」呼ばれるので、スクリプトの読み込み順を気にせずに済む。
 */
export function LiffAutoLogin({ tenantId, liffId }: { tenantId: string; liffId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "done" | "skip" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const startedRef = useRef(false);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    const liff = window.liff;
    if (!liff) {
      setState("error");
      setMessage("LINEのSDKを読み込めませんでした");
      return;
    }

    try {
      await liff.init({ liffId });

      if (!liff.isInClient()) {
        // LINEアプリの外（PCブラウザ等）。通常のログイン欄に任せる
        setState("skip");
        return;
      }

      if (!liff.isLoggedIn()) {
        liff.login(); // ページ遷移するので、この先は実行されない
        return;
      }

      const idToken = liff.getIDToken();
      if (!idToken) {
        setState("skip");
        return;
      }

      const res = await fetch("/api/liff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, idToken }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };

      if (data.ok) {
        setState("done");
        router.refresh();
      } else {
        setState("error");
        setMessage(data.message ?? "ログインに失敗しました");
      }
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "LINEとのやり取りに失敗しました");
    }
  }, [tenantId, liffId, router]);

  return (
    <>
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        strategy="afterInteractive"
        onReady={() => {
          void start();
        }}
      />
      {state === "loading" && (
        <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
          LINEでログインしています…
        </p>
      )}
      {state === "error" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-center text-xs text-amber-800">
          LINEでの自動ログインに失敗しました（{message}）。下からログインしてください。
        </p>
      )}
    </>
  );
}
