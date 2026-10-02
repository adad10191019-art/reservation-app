import { describe, expect, it } from "vitest";
import { defaultEnd, defaultStart, endChoices, endFor, lengthLabel, startChoices } from "./time-choices";

// 2026-10-02 14:07（日本時間）
const now = new Date("2026-10-02T05:07:00Z");

describe("startChoices / endChoices", () => {
  it("開始は 0:00〜23:45 の15分刻み", () => {
    const list = startChoices();
    expect(list[0]).toBe(0);
    expect(list.at(-1)).toBe(23 * 60 + 45);
    expect(list).toHaveLength(96);
  });

  it("終了は開始の15分後から 24:00 まで", () => {
    expect(endChoices(23 * 60)).toEqual([23 * 60 + 15, 23 * 60 + 30, 23 * 60 + 45, 24 * 60]);
  });
});

describe("defaultStart", () => {
  it("今日なら今の次の15分単位", () => {
    expect(defaultStart("2026-10-02", now)).toBe(14 * 60 + 15);
  });

  it("ちょうど15分単位ならその時刻", () => {
    expect(defaultStart("2026-10-02", new Date("2026-10-02T05:30:00Z"))).toBe(14 * 60 + 30);
  });

  it("今日以外は 9:00", () => {
    expect(defaultStart("2026-10-03", now)).toBe(9 * 60);
  });

  it("夜遅くは 23:00 にとどめる", () => {
    // 2026-10-02 23:50（日本時間）
    expect(defaultStart("2026-10-02", new Date("2026-10-02T14:50:00Z"))).toBe(23 * 60);
  });
});

describe("endFor / defaultEnd", () => {
  it("開始に長さを足す。24:00 は超えない", () => {
    expect(endFor(10 * 60, 90)).toBe(11 * 60 + 30);
    expect(endFor(23 * 60, 120)).toBe(24 * 60);
    expect(defaultEnd(9 * 60)).toBe(10 * 60);
  });
});

describe("lengthLabel", () => {
  it("分と時間の言い方", () => {
    expect(lengthLabel(30)).toBe("30分");
    expect(lengthLabel(60)).toBe("1時間");
    expect(lengthLabel(90)).toBe("1時間30分");
  });
});
