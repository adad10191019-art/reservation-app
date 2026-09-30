import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron-auth";

const SECRET = "0123456789abcdef-cron";

describe("定時実行からの呼び出しの確認", () => {
  it("正しい秘密の値なら通す", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("値が違う・形式が違う・無いときは通さない", () => {
    expect(isAuthorizedCronRequest("Bearer wrong-secret-value!!", SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(null, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest("", SECRET)).toBe(false);
  });

  it("秘密の値が未設定・短すぎるときは、誰も通さない", () => {
    expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer short", "short")).toBe(false);
  });
});
