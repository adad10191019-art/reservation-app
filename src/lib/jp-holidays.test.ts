import { describe, expect, it } from "vitest";
import { dayTint, holidayName, holidaysOfYear } from "./jp-holidays";

describe("holidaysOfYear", () => {
  it("2026年の祝日が内閣府の発表どおりに出る", () => {
    expect([...holidaysOfYear(2026).entries()].sort()).toEqual([
      ["2026-01-01", "元日"],
      ["2026-01-12", "成人の日"],
      ["2026-02-11", "建国記念の日"],
      ["2026-02-23", "天皇誕生日"],
      ["2026-03-20", "春分の日"],
      ["2026-04-29", "昭和の日"],
      ["2026-05-03", "憲法記念日"],
      ["2026-05-04", "みどりの日"],
      ["2026-05-05", "こどもの日"],
      ["2026-05-06", "振替休日"],
      ["2026-07-20", "海の日"],
      ["2026-08-11", "山の日"],
      ["2026-09-21", "敬老の日"],
      ["2026-09-22", "国民の休日"],
      ["2026-09-23", "秋分の日"],
      ["2026-10-12", "スポーツの日"],
      ["2026-11-03", "文化の日"],
      ["2026-11-23", "勤労感謝の日"],
    ]);
  });

  it("日曜の祝日の翌日が振替休日になる", () => {
    expect(holidayName("2025-02-24")).toBe("振替休日");
    expect(holidayName("2025-11-24")).toBe("振替休日");
    expect(holidayName("2027-03-21")).toBe("春分の日");
    expect(holidayName("2027-03-22")).toBe("振替休日");
  });

  it("春分の日・秋分の日", () => {
    expect(holidayName("2025-03-20")).toBe("春分の日");
    expect(holidayName("2025-09-23")).toBe("秋分の日");
    expect(holidayName("2028-09-22")).toBe("秋分の日");
  });

  it("祝日でない日は null", () => {
    expect(holidayName("2026-10-03")).toBeNull();
    expect(holidayName("2026-05-07")).toBeNull();
  });
});

describe("dayTint", () => {
  it("土曜は sat、日曜と祝日は sun、平日は null", () => {
    expect(dayTint("2026-10-03")).toBe("sat");
    expect(dayTint("2026-10-04")).toBe("sun");
    expect(dayTint("2026-10-12")).toBe("sun");
    expect(dayTint("2026-10-13")).toBeNull();
  });
});
