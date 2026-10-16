import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSealed, openSecret } from "./secret-box";
import { nextSecretValue } from "./secret-field";

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.DATA_ENCRYPTION_KEY;
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  if (saved === undefined) delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY = saved;
});

describe("nextSecretValue", () => {
  it("入れた値は暗号化して保存する（前後の空白は除く）", () => {
    const value = nextSecretValue({ input: "  new-secret ", clear: null, current: null });
    expect(value && isSealed(value)).toBe(true);
    expect(openSecret(value as string)).toBe("new-secret");
  });

  it("空欄なら今の値を残す", () => {
    expect(nextSecretValue({ input: "", clear: null, current: "v1:a:b:c" })).toBe("v1:a:b:c");
    expect(nextSecretValue({ input: null, clear: null, current: null })).toBeNull();
  });

  it("「消す」に印があれば、入れた値があっても消す", () => {
    expect(nextSecretValue({ input: "", clear: "on", current: "v1:a:b:c" })).toBeNull();
    expect(nextSecretValue({ input: "x", clear: "on", current: "v1:a:b:c" })).toBeNull();
  });
});
