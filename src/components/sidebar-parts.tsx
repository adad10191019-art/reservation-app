"use client";

/**
 * サイドバーのうち、ブラウザで動く部分。
 *   ・「≡」で横から出すメニュー（外のタップ・Esc・項目を選ぶ・画面を移ると閉じる）
 *   ・今いる画面の項目に色を付ける
 *   ・設定のまとまりの開け閉めと「固定」
 *   ・サイドバー全体の「固定」／「固定を外す」
 *   ・部署を選んだらすぐ切り替える
 * 固定したかどうかは Cookie に入れ、サーバーが最初から正しい形で描けるようにする（ちらつかない）。
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { switchTenant } from "@/lib/actions";
import {
  type NavItem,
  SETTINGS_PIN_COOKIE,
  SIDEBAR_PIN_COOKIE,
  type SidebarMode,
  isActive,
} from "@/lib/sidebar-nav";

/** 「≡」のメニューの中で項目を選んだら閉じるための、閉じる処理の受け渡し */
const CloseContext = createContext<() => void>(() => {});

function setPref(name: string, value: "1" | "0") {
  // 1年覚えておく。ログイン状態とは関係のない、見た目の好みだけ
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

const ITEM =
  "block rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100";
const ITEM_ACTIVE = "block rounded-md px-3 py-2 text-sm font-medium bg-sky-50 text-sky-900";

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const close = useContext(CloseContext);
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={close}
              aria-current={active ? "page" : undefined}
              className={active ? ITEM_ACTIVE : ITEM}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

/**
 * 設定のまとまり。固定していれば開いたまま。設定の画面にいるときも開いて出す。
 * 開いているときだけ「固定」のボタンを出す。
 */
export function SettingsGroup({ items, pinned }: { items: NavItem[]; pinned: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const inSettings = items.some((item) => isActive(pathname, item));
  const [open, setOpen] = useState(pinned || inSettings);
  const [isPinned, setIsPinned] = useState(pinned);

  // 設定の画面へ移ったら開く（閉じるのは本人が閉じたときだけ）。描画の中で前回と比べて合わせる
  const [prevInSettings, setPrevInSettings] = useState(inSettings);
  if (inSettings !== prevInSettings) {
    setPrevInSettings(inSettings);
    if (inSettings) setOpen(true);
  }

  const togglePin = () => {
    const next = !isPinned;
    setIsPinned(next);
    setPref(SETTINGS_PIN_COOKIE, next ? "1" : "0");
    router.refresh();
  };

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-1 rounded-md px-3 py-2 text-left text-xs font-medium text-neutral-500 hover:bg-neutral-100"
        >
          <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>
            ▸
          </span>
          設定
        </button>
        {open && (
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={isPinned}
            title={isPinned ? "固定を外す（開け閉めできるようにする）" : "開いたまま固定する"}
            aria-label={isPinned ? "設定の固定を外す" : "設定を開いたまま固定する"}
            className={`rounded-md p-1.5 hover:bg-neutral-100 ${isPinned ? "text-sky-700" : "text-neutral-400"}`}
          >
            <PinIcon filled={isPinned} />
          </button>
        )}
      </div>
      {open && (
        <div className="ml-2 border-l border-neutral-200 pl-1">
          <NavLinks items={items} />
        </div>
      )}
    </div>
  );
}

/** サイドバー全体の固定。固定中（左に出ている）なら「固定を外す」、≡ の中なら「固定する」 */
export function SidebarPinButton({ pinned, className }: { pinned: boolean; className?: string }) {
  const router = useRouter();
  const close = useContext(CloseContext);
  return (
    <button
      type="button"
      onClick={() => {
        setPref(SIDEBAR_PIN_COOKIE, pinned ? "0" : "1");
        close();
        router.refresh();
      }}
      title={pinned ? "サイドバーを隠して「≡」で出すようにする" : "サイドバーを左に出したままにする"}
      className={`items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 ${className ?? "inline-flex"}`}
    >
      <PinIcon filled={pinned} />
      {pinned ? "固定を外す" : "固定する"}
    </button>
  );
}

/**
 * 部署の切り替え。選んだらすぐ切り替える。
 * 全社管理者は「部署を選ばない」も選べる（全体スケジュールだけの状態。選んでいる間は色を付けない）
 */
export function TenantSelect({
  tenants,
  currentId,
  allowNone,
}: {
  tenants: { id: string; name: string }[];
  currentId: string | null;
  allowNone: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={switchTenant}>
      <select
        // 切り替えたあとの描き直しで、選んでいる部署を合わせ直す
        key={currentId ?? ""}
        name="tenantId"
        defaultValue={currentId ?? ""}
        aria-label="部署を切り替える"
        onChange={() => formRef.current?.requestSubmit()}
        className={`w-full rounded-md border px-2 py-1.5 text-sm ${
          currentId
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-neutral-300 bg-white text-neutral-600"
        }`}
      >
        {allowNone && <option value="">部署を選ばない（全体）</option>}
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </form>
  );
}

/** 「≡」の見せ方。サイドバーが左に出ている幅では隠す */
const MENU_BUTTON_VISIBILITY: Record<SidebarMode, string> = {
  auto: "lg:hidden",
  pinned: "md:hidden",
  unpinned: "",
};

/** 「≡」のボタンと、押すと横から出るメニュー */
export function SidebarDrawer({ mode, children }: { mode: SidebarMode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 画面を移ったら閉じる。描画の中で前回の画面と比べて合わせる
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    // 開いている間は後ろの画面を動かさない
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="メニューを開く"
        aria-expanded={open}
        className={`flex size-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 ${MENU_BUTTON_VISIBILITY[mode]}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="size-5"
          aria-hidden
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="メニュー">
          <div className="flex h-full w-72 max-w-[85%] flex-col overflow-y-auto border-r border-neutral-200 bg-white">
            <div className="flex items-center justify-end p-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="メニューを閉じる"
                className="flex size-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>
            <CloseContext.Provider value={() => setOpen(false)}>{children}</CloseContext.Provider>
          </div>
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/30"
          />
        </div>
      )}
    </>
  );
}
