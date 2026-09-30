import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("ログイン後の戻り先", () => {
  it("サイト内のパスはそのまま通す", () => {
    expect(safeNextPath("/book/shop?date=2026-10-01&menuId=abc", "/")).toBe(
      "/book/shop?date=2026-10-01&menuId=abc",
    );
  });

  it("空なら既定の戻り先にする", () => {
    expect(safeNextPath("", "/book/shop")).toBe("/book/shop");
    expect(safeNextPath(undefined, "/book/shop")).toBe("/book/shop");
    expect(safeNextPath(null, "/book/shop")).toBe("/book/shop");
  });

  it("外部のサイトは通さない", () => {
    expect(safeNextPath("https://evil.example.com", "/")).toBe("/");
    expect(safeNextPath("//evil.example.com", "/")).toBe("/");
    expect(safeNextPath("/\\evil.example.com", "/")).toBe("/");
    expect(safeNextPath("javascript:alert(1)", "/")).toBe("/");
  });
});
