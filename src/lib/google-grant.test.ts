import { describe, expect, it } from "vitest";
import { isRevokedGrantResponse } from "./google-grant";

describe("isRevokedGrantResponse", () => {
  it("invalid_grant なら切れたと見なす（取り消し・期限切れ）", () => {
    expect(
      isRevokedGrantResponse(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }),
    ).toBe(true);
  });

  it("こちらの設定の誤り（invalid_client）は、その人の連携が切れたことにしない", () => {
    expect(isRevokedGrantResponse(401, { error: "invalid_client" })).toBe(false);
  });

  it("Google 側の一時的な不調は切れたことにしない", () => {
    expect(isRevokedGrantResponse(500, { error: "internal_failure" })).toBe(false);
    expect(isRevokedGrantResponse(503, null)).toBe(false);
  });

  it("中身が読めない応答は切れたことにしない", () => {
    expect(isRevokedGrantResponse(400, null)).toBe(false);
    expect(isRevokedGrantResponse(400, "invalid_grant")).toBe(false);
  });
});
