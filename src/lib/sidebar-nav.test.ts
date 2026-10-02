import { describe, expect, it } from "vitest";
import { buildNav, isActive, sidebarModeOf } from "./sidebar-nav";

const labels = (items: { label: string }[] | null) => items?.map((i) => i.label) ?? null;

describe("サイドバーの項目", () => {
  it("全社管理者は設定に「部署」まで出る", () => {
    const nav = buildNav({ role: "group_admin", staffId: null });
    expect(labels(nav.main)).toEqual(["カレンダー", "顧客一覧", "全体スケジュール"]);
    expect(labels(nav.settings)?.at(-1)).toBe("部署");
    expect(labels(nav.settings)).toContain("メンバー");
  });

  it("オーナーは設定が出るが「部署」は出ない。予約を受ける人には自分の予定が出る", () => {
    const nav = buildNav({ role: "owner", staffId: "s1" });
    expect(labels(nav.main)).toEqual(["カレンダー", "顧客一覧", "自分の予定", "全体スケジュール"]);
    expect(labels(nav.settings)).not.toContain("部署");
  });

  it("一般は設定が出ず、部署なしの社員は全体スケジュールだけ", () => {
    expect(buildNav({ role: "staff", staffId: "s1" }).settings).toBeNull();
    const member = buildNav({ role: "member", staffId: null });
    expect(labels(member.main)).toEqual(["全体スケジュール"]);
    expect(member.settings).toBeNull();
  });
});

describe("今いる画面", () => {
  const calendar = buildNav({ role: "owner", staffId: null }).main[0];

  it("その下の画面と、予約の登録・詳細もカレンダーの中とみなす", () => {
    expect(isActive("/calendar", calendar)).toBe(true);
    expect(isActive("/calendar/week", calendar)).toBe(true);
    expect(isActive("/booking", calendar)).toBe(true);
    expect(isActive("/reservations/abc", calendar)).toBe(true);
  });

  it("名前が前方だけ同じ別の画面は含まない", () => {
    expect(isActive("/calendarx", calendar)).toBe(false);
    expect(isActive("/customers", calendar)).toBe(false);
  });
});

describe("サイドバーの出し方", () => {
  it("Cookie が無ければ自動、1 なら固定、0 なら固定を外す", () => {
    expect(sidebarModeOf(undefined)).toBe("auto");
    expect(sidebarModeOf("1")).toBe("pinned");
    expect(sidebarModeOf("0")).toBe("unpinned");
    expect(sidebarModeOf("x")).toBe("auto");
  });
});
