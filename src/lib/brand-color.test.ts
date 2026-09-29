import { describe, expect, it } from "vitest";
import { isValidHexColor, resolveBrandPalette } from "./brand-color";

describe("ブランドカラーの検査", () => {
  it("正しい16進数だけを受け取る", () => {
    expect(isValidHexColor("#1F2A44")).toBe(true);
    expect(isValidHexColor("1F2A44")).toBe(true);
    expect(isValidHexColor("#fff")).toBe(false);
    expect(isValidHexColor("blue")).toBe(false);
    expect(isValidHexColor("")).toBe(false);
  });
});

describe("ブランドカラーから色味一式を作る", () => {
  it("未設定なら既定のネイビーになる", () => {
    const palette = resolveBrandPalette(null);
    expect(palette.base).toBe("#1f2a44");
  });

  it("明るい色には黒文字、暗い色には白文字を選ぶ", () => {
    expect(resolveBrandPalette("#FFFFFF").onBase).toBe("#1A1A1A");
    expect(resolveBrandPalette("#000000").onBase).toBe("#FFFFFF");
  });

  it("hoverは元の色より暗く、tintは元の色より明るくなる", () => {
    const palette = resolveBrandPalette("#3366CC");
    expect(palette.hover).not.toBe(palette.base);
    expect(palette.tint).not.toBe(palette.base);
  });
});
