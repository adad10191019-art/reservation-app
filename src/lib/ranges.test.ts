import { describe, expect, it } from "vitest";
import { formatRanges, parseRanges } from "./ranges";
import { hm } from "./time";

describe("時間帯の読み取り", () => {
  it("複数の区間を読める", () => {
    const r = parseRanges("10:00-13:00, 14:00-19:00");
    expect(r).toEqual({
      ok: true,
      intervals: [
        { start: hm("10:00"), end: hm("13:00") },
        { start: hm("14:00"), end: hm("19:00") },
      ],
    });
  });

  it("空文字は休みとして扱う", () => {
    expect(parseRanges("")).toEqual({ ok: true, intervals: [] });
    expect(parseRanges("   ")).toEqual({ ok: true, intervals: [] });
  });

  it("全角の記号やスペースを直して読む", () => {
    const r = parseRanges("１0：00〜13：00、14:00-19:00".replace(/１/g, "1"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.intervals).toEqual([
        { start: hm("10:00"), end: hm("13:00") },
        { start: hm("14:00"), end: hm("19:00") },
      ]);
    }
  });

  it("順番が逆でも並べ替える", () => {
    const r = parseRanges("14:00-19:00, 10:00-13:00");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.intervals[0].start).toBe(hm("10:00"));
  });

  it("形式が違えば理由を返す", () => {
    const r = parseRanges("10時-13時");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("形式");
  });

  it("終了が開始より前なら弾く", () => {
    const r = parseRanges("19:00-10:00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("終了");
  });

  it("24時を超える指定は弾く", () => {
    const r = parseRanges("10:00-25:00");
    expect(r.ok).toBe(false);
  });

  it("区間が重なっていれば弾く", () => {
    const r = parseRanges("10:00-14:00, 13:00-19:00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("重なっています");
  });

  it("接しているだけなら通す", () => {
    const r = parseRanges("10:00-13:00, 13:00-19:00");
    expect(r.ok).toBe(true);
  });
});

describe("時間帯の書き出し", () => {
  it("読める形に戻せる", () => {
    const text = "10:00-13:00, 14:00-19:00";
    const parsed = parseRanges(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(formatRanges(parsed.intervals)).toBe(text);
  });

  it("区間がなければ空文字", () => {
    expect(formatRanges([])).toBe("");
  });
});
