import { describe, expect, it } from "vitest";
import {
  addMonths,
  containsToday,
  monthWeeks,
  mondayOf,
  parseView,
  safeReturnPath,
  shiftDate,
  viewDates,
  viewTitle,
  weekDates,
} from "./schedule-range";

describe("parseView", () => {
  it("week・month 以外は1日表示", () => {
    expect(parseView("week")).toBe("week");
    expect(parseView("month")).toBe("month");
    expect(parseView(undefined)).toBe("day");
    expect(parseView("year")).toBe("day");
  });
});

describe("週（月曜はじまり）", () => {
  it("日曜はその前の月曜からの週に入る", () => {
    expect(mondayOf("2026-10-04")).toBe("2026-09-28"); // 日曜
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // 月曜
    expect(mondayOf("2026-10-03")).toBe("2026-09-28"); // 土曜
  });

  it("7日分を月〜日で返す", () => {
    expect(weekDates("2026-10-01")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("monthWeeks", () => {
  it("2026年10月は 9/28 の週から 11/1 の週まで5行", () => {
    const weeks = monthWeeks("2026-10-15");
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(weeks[4][6]).toBe("2026-11-01");
  });

  it("1日が月曜の月は前の月の日を含まない（2026年6月）", () => {
    const weeks = monthWeeks("2026-06-10");
    expect(weeks[0][0]).toBe("2026-06-01");
    expect(weeks.flat()).toContain("2026-06-30");
  });

  it("6行になる月もある（2026年8月は 8/1 が土曜）", () => {
    expect(monthWeeks("2026-08-01")).toHaveLength(6);
  });

  it("viewDates はマス目の全部の日", () => {
    expect(viewDates("month", "2026-10-15")).toHaveLength(35);
    expect(viewDates("week", "2026-10-15")).toHaveLength(7);
    expect(viewDates("day", "2026-10-15")).toEqual(["2026-10-15"]);
  });
});

describe("前へ・次へ", () => {
  it("月をまたぐとき、無い日はその月の末日にする", () => {
    expect(addMonths("2026-10-31", 1)).toBe("2026-11-30");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("表示ごとに1日・7日・1か月動かす", () => {
    expect(shiftDate("day", "2026-10-03", 1)).toBe("2026-10-04");
    expect(shiftDate("week", "2026-10-03", -1)).toBe("2026-09-26");
    expect(shiftDate("month", "2026-10-03", 1)).toBe("2026-11-03");
  });

  it("今日を含む範囲か", () => {
    expect(containsToday("week", "2026-09-28", "2026-10-04")).toBe(true);
    expect(containsToday("week", "2026-10-05", "2026-10-04")).toBe(false);
    expect(containsToday("month", "2026-10-31", "2026-10-03")).toBe(true);
    expect(containsToday("day", "2026-10-04", "2026-10-03")).toBe(false);
  });
});

describe("viewTitle", () => {
  it("日・週・月の見出し", () => {
    expect(viewTitle("day", "2026-10-03")).toBe("10月3日(土)");
    expect(viewTitle("week", "2026-10-03")).toBe("9月28日(月)〜10月4日(日)");
    expect(viewTitle("month", "2026-10-03")).toBe("2026年10月");
  });
});

describe("safeReturnPath", () => {
  it("同じ画面の中なら、知らせを外して戻る", () => {
    expect(safeReturnPath("/team?view=week&date=2026-10-03&done=1", "/team", "2026-10-03")).toBe(
      "/team?view=week&date=2026-10-03",
    );
  });

  it("日付は足した・消した予定の日にする（表示・選んだ人はそのまま）", () => {
    expect(safeReturnPath("/team?view=month&date=2026-10-03&person=e1", "/team", "2026-11-20")).toBe(
      "/team?view=month&date=2026-11-20&person=e1",
    );
  });

  it("ほかの画面・外のサイト・空なら、その日の1日表示", () => {
    const fallback = "/team?date=2026-10-03";
    expect(safeReturnPath("https://evil.example/team?x", "/team", "2026-10-03")).toBe(fallback);
    expect(safeReturnPath("//evil.example", "/team", "2026-10-03")).toBe(fallback);
    expect(safeReturnPath("/settings?x=1", "/team", "2026-10-03")).toBe(fallback);
    expect(safeReturnPath(null, "/team", "2026-10-03")).toBe(fallback);
  });
});
