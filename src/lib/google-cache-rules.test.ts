import { describe, expect, it } from "vitest";
import { CACHE_MINUTES, isCacheFresh, parseCachedItems } from "./google-cache-rules";

describe("isCacheFresh", () => {
  const fetchedAt = new Date("2026-10-03T01:00:00Z");

  it(`${CACHE_MINUTES}分たつまでは使う`, () => {
    expect(isCacheFresh(fetchedAt, new Date("2026-10-03T01:09:59Z"))).toBe(true);
  });

  it(`${CACHE_MINUTES}分たったら取り直す`, () => {
    expect(isCacheFresh(fetchedAt, new Date("2026-10-03T01:10:00Z"))).toBe(false);
  });
});

describe("parseCachedItems", () => {
  it("正しい形だけを読み戻す", () => {
    expect(
      parseCachedItems([
        { start: 600, end: 660, title: "来客" },
        { start: 700, end: 720, title: null },
        { start: "x", end: 1 },
        null,
      ]),
    ).toEqual([
      { start: 600, end: 660, title: "来客" },
      { start: 700, end: 720, title: null },
    ]);
  });

  it("配列でなければ空", () => {
    expect(parseCachedItems({})).toEqual([]);
  });
});

describe("parseCachedItems の ID", () => {
  it("ID と直せる印を読み戻す。ID の無い古い控えはそのまま", () => {
    expect(
      parseCachedItems([
        { start: 600, end: 660, title: null, id: "a", editable: true },
        { start: 700, end: 760, title: "x" },
      ]),
    ).toEqual([
      { start: 600, end: 660, title: null, id: "a", editable: true },
      { start: 700, end: 760, title: "x" },
    ]);
  });
});
