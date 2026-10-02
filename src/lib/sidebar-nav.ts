/**
 * 左のサイドバーに出す項目（DB も Cookie も使わない判断だけ。画面は components/app-sidebar.tsx）。
 *
 *   ・毎日使うもの：カレンダー・顧客一覧・自分の予定（予約を受ける人だけ）・全社の1日
 *   ・設定：オーナーと全社管理者だけ（「部署」は全社管理者だけ）
 *   ・部署に属さない社員（member）は、全社の1日だけ
 * 通知設定・アカウント情報・ログアウトは、サイドバーの下にまとめて出す。
 */

export type NavItem = {
  href: string;
  label: string;
  /** この項目を「今いる画面」として色を付けるパス（その下の画面も含む） */
  match: string[];
};

/** サイドバー・ページ上部に出す設定の項目（並び順もこのとおり） */
export const SETTINGS_ITEMS: NavItem[] = [
  { href: "/settings/onboarding", label: "セットアップ", match: ["/settings/onboarding"] },
  { href: "/settings/menus", label: "メニュー", match: ["/settings/menus"] },
  { href: "/settings/members", label: "メンバー", match: ["/settings/members"] },
  { href: "/settings/hours", label: "営業時間", match: ["/settings/hours"] },
  { href: "/settings/days", label: "日付ごと", match: ["/settings/days"] },
  { href: "/settings/store", label: "店舗", match: ["/settings/store"] },
  { href: "/settings/analytics", label: "集計", match: ["/settings/analytics"] },
  { href: "/settings/history", label: "履歴", match: ["/settings/history"] },
];

const TENANTS_ITEM: NavItem = { href: "/settings/tenants", label: "部署", match: ["/settings/tenants"] };
const TEAM_ITEM: NavItem = { href: "/team", label: "全社の1日", match: ["/team"] };

export function buildNav(session: { role: string; staffId: string | null }): {
  main: NavItem[];
  settings: NavItem[] | null;
} {
  if (session.role === "member") return { main: [TEAM_ITEM], settings: null };

  const main: NavItem[] = [
    // 予約の登録・詳細もカレンダーから入る画面なので、カレンダーの中として扱う
    { href: "/calendar", label: "カレンダー", match: ["/calendar", "/booking", "/reservations"] },
    { href: "/customers", label: "顧客一覧", match: ["/customers"] },
    ...(session.staffId
      ? [{ href: "/my-schedule", label: "自分の予定", match: ["/my-schedule"] }]
      : []),
    TEAM_ITEM,
  ];

  const settings =
    session.role === "group_admin"
      ? [...SETTINGS_ITEMS, TENANTS_ITEM]
      : session.role === "owner"
        ? SETTINGS_ITEMS
        : null;

  return { main, settings };
}

/** 今の画面がその項目の中か（"/calendar" は "/calendar/week" も含み、"/calendarx" は含まない） */
export function isActive(pathname: string, item: NavItem): boolean {
  return item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

/** サイドバーの出し方。auto＝パソコンの幅では常に出し、それより狭ければ「≡」で出す */
export type SidebarMode = "auto" | "pinned" | "unpinned";

export const SIDEBAR_PIN_COOKIE = "sb_pin";
export const SETTINGS_PIN_COOKIE = "sb_settings";

export function sidebarModeOf(cookieValue: string | undefined): SidebarMode {
  if (cookieValue === "1") return "pinned";
  if (cookieValue === "0") return "unpinned";
  return "auto";
}
