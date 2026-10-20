import { describe, expect, it } from "vitest";
import { parseCalendarScope, pickVisibleStaff, scopeQuery } from "./calendar-scope";

const katayama = { staffId: "k", takesBookings: true, hasReservations: false };
const takeuchi = { staffId: "t", takesBookings: false, hasReservations: false };
const other = { staffId: "o", takesBookings: true, hasReservations: true };

describe("parseCalendarScope", () => {
  it("all=1 のときだけ全員", () => {
    expect(parseCalendarScope("1")).toBe("all");
    expect(parseCalendarScope(undefined)).toBe("mine");
    expect(parseCalendarScope("yes")).toBe("mine");
  });

  it("全員のときだけリンクに続きを付ける", () => {
    expect(scopeQuery("all")).toBe("&all=1");
    expect(scopeQuery("mine")).toBe("");
  });
});

describe("pickVisibleStaff", () => {
  const staffs = [katayama, takeuchi, other];

  it("最初は自分の列だけ", () => {
    const r = pickVisibleStaff(staffs, "k", "mine");
    expect(r.visible).toEqual([katayama]);
    expect(r.showingMineOnly).toBe(true);
  });

  it("全員を見るときも、メニューも予約も無い人は出さない", () => {
    const r = pickVisibleStaff(staffs, "k", "all");
    expect(r.visible).toEqual([katayama, other]);
    expect(r.showingMineOnly).toBe(false);
    expect(r.hasOwnColumn).toBe(true);
  });

  it("メニューが無くても、予約が残っている人は出す", () => {
    const withBooking = { ...takeuchi, hasReservations: true };
    expect(pickVisibleStaff([katayama, withBooking], "k", "all").visible).toEqual([
      katayama,
      withBooking,
    ]);
  });

  it("自分の列が無い人（名前だけオーナー・全社管理者）は最初から全員", () => {
    for (const viewer of ["t", null]) {
      const r = pickVisibleStaff(staffs, viewer, "mine");
      expect(r.visible).toEqual([katayama, other]);
      expect(r.showingMineOnly).toBe(false);
      expect(r.hasOwnColumn).toBe(false);
    }
  });
});
