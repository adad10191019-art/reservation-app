import { describe, expect, it } from "vitest";
import { suggestSlug, validateSlug } from "./slug";

describe("短い名前の検査", () => {
  it("英小文字・数字・ハイフンは通る", () => {
    expect(validateSlug("sample-salon")).toEqual({ ok: true, slug: "sample-salon" });
    expect(validateSlug("shop123")).toEqual({ ok: true, slug: "shop123" });
  });

  it("大文字と前後の空白は直して受け取る", () => {
    expect(validateSlug("  Sample-Salon  ")).toEqual({ ok: true, slug: "sample-salon" });
  });

  it("使えない文字は弾く", () => {
    expect(validateSlug("サンプル").ok).toBe(false);
    expect(validateSlug("sample salon").ok).toBe(false);
    expect(validateSlug("sample_salon").ok).toBe(false);
    expect(validateSlug("sample.salon").ok).toBe(false);
  });

  it("短すぎ・長すぎは弾く", () => {
    expect(validateSlug("ab").ok).toBe(false);
    expect(validateSlug("a".repeat(41)).ok).toBe(false);
  });

  it("ハイフンの使い方を制限する", () => {
    expect(validateSlug("-shop").ok).toBe(false);
    expect(validateSlug("shop-").ok).toBe(false);
    expect(validateSlug("sh--op").ok).toBe(false);
  });

  it("店舗IDと紛らわしい形式は弾く", () => {
    expect(validateSlug("e3a3a745-a6ae-401c-8de1-ee4fc368394f").ok).toBe(false);
  });

  it("空は弾く", () => {
    expect(validateSlug("").ok).toBe(false);
    expect(validateSlug("   ").ok).toBe(false);
  });
});

describe("店舗名からの候補", () => {
  it("英数字があれば使える形にする", () => {
    expect(suggestSlug("Sample Salon")).toBe("sample-salon");
    expect(suggestSlug("Hair & Make BLOOM")).toBe("hair-make-bloom");
  });

  it("日本語だけなら候補を出さない", () => {
    expect(suggestSlug("サンプルヘアサロン")).toBe("");
  });
});
