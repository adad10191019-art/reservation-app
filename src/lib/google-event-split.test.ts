import { describe, expect, it } from "vitest";
import { splitGoogleEventsByDate } from "./google-event-split";

const dates = ["2026-10-05", "2026-10-06", "2026-10-07"];

describe("splitGoogleEventsByDate", () => {
  it("時刻のある予定は、その日の0時からの分にする（日本時間）", () => {
    const result = splitGoogleEventsByDate(
      [{ summary: "打ち合わせ", start: { dateTime: "2026-10-06T10:00:00+09:00" }, end: { dateTime: "2026-10-06T11:30:00+09:00" } }],
      dates,
      true,
    );
    expect(result.get("2026-10-06")).toEqual([{ start: 600, end: 690, title: "打ち合わせ" }]);
    expect(result.get("2026-10-05")).toEqual([]);
  });

  it("日をまたぐ予定は、それぞれの日に切って入れる", () => {
    const result = splitGoogleEventsByDate(
      [{ summary: "夜勤", start: { dateTime: "2026-10-05T22:00:00+09:00" }, end: { dateTime: "2026-10-06T06:00:00+09:00" } }],
      dates,
      true,
    );
    expect(result.get("2026-10-05")).toEqual([{ start: 1320, end: 1440, title: "夜勤" }]);
    expect(result.get("2026-10-06")).toEqual([{ start: 0, end: 360, title: "夜勤" }]);
  });

  it("終日の予定は、終わりの日付を含まない", () => {
    const result = splitGoogleEventsByDate(
      [{ summary: "出張", start: { date: "2026-10-05" }, end: { date: "2026-10-07" } }],
      dates,
      true,
    );
    expect(result.get("2026-10-05")).toEqual([{ start: 0, end: 1440, title: "出張" }]);
    expect(result.get("2026-10-06")).toEqual([{ start: 0, end: 1440, title: "出張" }]);
    expect(result.get("2026-10-07")).toEqual([]);
  });

  it("「予定なし」・キャンセル済みは出さず、非公開と件名を出さない設定は件名を隠す", () => {
    const at = { start: { dateTime: "2026-10-07T09:00:00+09:00" }, end: { dateTime: "2026-10-07T10:00:00+09:00" } };
    const result = splitGoogleEventsByDate(
      [
        { ...at, summary: "空き", transparency: "transparent" },
        { ...at, summary: "中止", status: "cancelled" },
        { ...at, summary: "通院", visibility: "private" },
      ],
      dates,
      true,
    );
    expect(result.get("2026-10-07")).toEqual([{ start: 540, end: 600, title: null }]);

    const noTitles = splitGoogleEventsByDate([{ ...at, summary: "会議" }], dates, false);
    expect(noTitles.get("2026-10-07")).toEqual([{ start: 540, end: 600, title: null }]);
  });
});

describe("splitGoogleEventsByDate の ID と直せるか", () => {
  it("ID のある1日の予定は、ID つきで直せる印を付ける（0時ちょうどに終わる予定もその日のうち）", () => {
    const result = splitGoogleEventsByDate(
      [
        { id: "a", summary: "面談", start: { dateTime: "2026-10-06T10:00:00+09:00" }, end: { dateTime: "2026-10-06T11:00:00+09:00" } },
        { id: "b", summary: "夜", start: { dateTime: "2026-10-06T22:00:00+09:00" }, end: { dateTime: "2026-10-07T00:00:00+09:00" } },
      ],
      dates,
      true,
    );
    expect(result.get("2026-10-06")).toEqual([
      { start: 600, end: 660, title: "面談", id: "a", editable: true },
      { start: 1320, end: 1440, title: "夜", id: "b", editable: true },
    ]);
  });

  it("何日にもまたがる予定は直せない印にする（消すことはできる）", () => {
    const result = splitGoogleEventsByDate(
      [
        { id: "c", summary: "夜勤", start: { dateTime: "2026-10-05T22:00:00+09:00" }, end: { dateTime: "2026-10-06T06:00:00+09:00" } },
        { id: "d", summary: "出張", start: { date: "2026-10-05" }, end: { date: "2026-10-07" } },
      ],
      dates,
      true,
    );
    expect(result.get("2026-10-05")?.map((i) => [i.id, i.editable])).toEqual([
      ["d", false],
      ["c", false],
    ]);
  });
});
