import { describe, expect, it } from "vitest";
import {
  dayOfWeekOf,
  generateStarts,
  hm,
  intersect,
  normalize,
  subtract,
  toHm,
} from "./time";

describe("時刻の変換", () => {
  it("文字列と分を相互に変換できる", () => {
    expect(hm("10:30")).toBe(630);
    expect(hm("00:00")).toBe(0);
    expect(hm("19:00")).toBe(1140);
    expect(toHm(630)).toBe("10:30");
    expect(toHm(0)).toBe("00:00");
  });

  it("形式が不正なら例外になる", () => {
    expect(() => hm("10時30分")).toThrow();
    expect(() => hm("1030")).toThrow();
  });
});

describe("曜日の判定", () => {
  it("タイムゾーンに影響されず曜日を返す", () => {
    expect(dayOfWeekOf("2026-09-20")).toBe(0); // 日曜
    expect(dayOfWeekOf("2026-09-21")).toBe(1); // 月曜
    expect(dayOfWeekOf("2026-09-26")).toBe(6); // 土曜
  });

  it("形式が不正なら例外になる", () => {
    expect(() => dayOfWeekOf("2026/09/21")).toThrow();
  });
});

describe("normalize（整理）", () => {
  it("離れた時間帯はそのまま残る", () => {
    expect(normalize([{ start: 600, end: 780 }, { start: 840, end: 1140 }])).toEqual([
      { start: 600, end: 780 },
      { start: 840, end: 1140 },
    ]);
  });

  it("隣接・重複はひとつにまとまる", () => {
    expect(normalize([{ start: 600, end: 780 }, { start: 780, end: 840 }])).toEqual([
      { start: 600, end: 840 },
    ]);
    expect(normalize([{ start: 600, end: 800 }, { start: 700, end: 900 }])).toEqual([
      { start: 600, end: 900 },
    ]);
  });

  it("長さ0以下は捨てられ、順番も揃う", () => {
    expect(normalize([{ start: 840, end: 900 }, { start: 600, end: 600 }])).toEqual([
      { start: 840, end: 900 },
    ]);
  });
});

describe("intersect（重なり）", () => {
  it("両方に含まれる部分だけを返す", () => {
    const hours = [{ start: 600, end: 780 }, { start: 840, end: 1140 }];
    const limit = [{ start: 600, end: 900 }];
    expect(intersect(hours, limit)).toEqual([
      { start: 600, end: 780 },
      { start: 840, end: 900 },
    ]);
  });

  it("重なりがなければ空になる", () => {
    expect(intersect([{ start: 600, end: 700 }], [{ start: 800, end: 900 }])).toEqual([]);
  });
});

describe("subtract（引き算）", () => {
  it("真ん中を抜くと2つに割れる", () => {
    expect(subtract([{ start: 600, end: 1140 }], [{ start: 700, end: 800 }])).toEqual([
      { start: 600, end: 700 },
      { start: 800, end: 1140 },
    ]);
  });

  it("端を抜くと片側だけ残る", () => {
    expect(subtract([{ start: 600, end: 1140 }], [{ start: 600, end: 700 }])).toEqual([
      { start: 700, end: 1140 },
    ]);
  });

  it("全部覆われると空になる", () => {
    expect(subtract([{ start: 600, end: 700 }], [{ start: 500, end: 800 }])).toEqual([]);
  });

  it("接しているだけなら削られない", () => {
    expect(subtract([{ start: 600, end: 700 }], [{ start: 700, end: 800 }])).toEqual([
      { start: 600, end: 700 },
    ]);
  });
});

describe("generateStarts（開始できる時刻）", () => {
  it("所要時間が収まる時刻だけを返す", () => {
    const starts = generateStarts([{ start: 600, end: 780 }], 70, 15);
    expect(starts[0]).toBe(hm("10:00"));
    expect(starts.at(-1)).toBe(hm("11:45")); // 11:45 + 70分 = 12:55 で 13:00 に収まる
    expect(starts).not.toContain(hm("12:00")); // 12:00 + 70分 = 13:10 ではみ出す
  });

  it("開始時刻は刻みに揃う", () => {
    // 11:05 から空いている場合、11:05 ではなく 11:15 から
    const starts = generateStarts([{ start: 665, end: 960 }], 35, 15);
    expect(starts[0]).toBe(hm("11:15"));
  });

  it("所要時間が入らない区間からは何も出ない", () => {
    expect(generateStarts([{ start: 600, end: 630 }], 35, 15)).toEqual([]);
  });

  it("引数が不正なら例外になる", () => {
    expect(() => generateStarts([{ start: 600, end: 700 }], 0, 15)).toThrow();
    expect(() => generateStarts([{ start: 600, end: 700 }], 30, 0)).toThrow();
  });
});
