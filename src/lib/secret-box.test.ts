import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isSealed,
  isSealedWithCurrentKey,
  openSecret,
  openSecretOrNull,
  sealSecret,
  sealSecretOrNull,
  SecretBoxError,
} from "./secret-box";

const KEY = randomBytes(32).toString("base64");
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.DATA_ENCRYPTION_KEY;
  process.env.DATA_ENCRYPTION_KEY = KEY;
});

afterEach(() => {
  if (saved === undefined) delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY = saved;
});

describe("sealSecret / openSecret", () => {
  it("暗号化したものを元に戻せる（日本語や記号も）", () => {
    for (const plain of ["abc123", "1//0gAbC-dEf_ghi", "ya29.a0Af", "日本語のトークン", "a:b:c"]) {
      const sealed = sealSecret(plain);
      expect(sealed).not.toContain(plain);
      expect(isSealed(sealed)).toBe(true);
      expect(openSecret(sealed)).toBe(plain);
    }
  });

  it("保存する形に版の印 v1 が付く", () => {
    expect(sealSecret("x")).toMatch(/^v1:/);
    expect(isSealedWithCurrentKey(sealSecret("x"))).toBe(true);
  });

  it("同じ値でも毎回違う暗号文になる（中身が同じだと見抜かれない）", () => {
    expect(sealSecret("same")).not.toBe(sealSecret("same"));
  });

  it("暗号化を入れる前の平文は、そのまま読む（段階移行）", () => {
    // LINE のチャネルシークレット（16進32文字）や Google のトークンの形
    for (const plain of ["0123456789abcdef0123456789abcdef", "1//0gAbC", "ya29.a0Af-xyz"]) {
      expect(isSealed(plain)).toBe(false);
      expect(openSecret(plain)).toBe(plain);
    }
  });

  it("書き換えられた値は元に戻さずに止める", () => {
    const sealed = sealSecret("secret");
    const parts = sealed.split(":");
    const body = Buffer.from(parts[3], "base64url");
    body[0] ^= 1;
    parts[3] = body.toString("base64url");
    expect(() => openSecret(parts.join(":"))).toThrow(SecretBoxError);
  });

  it("違う鍵では元に戻せない", () => {
    const sealed = sealSecret("secret");
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => openSecret(sealed)).toThrow(SecretBoxError);
  });

  it("鍵が無いときは平文で保存せずに止める", () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => sealSecret("secret")).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("鍵の長さが違うときも止める", () => {
    process.env.DATA_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => sealSecret("secret")).toThrow(/32バイト/);
  });

  it("知らない版の印は止める", () => {
    const sealed = sealSecret("secret").replace(/^v1:/, "v9:");
    expect(() => openSecret(sealed)).toThrow(/v9/);
  });
});

describe("sealSecretOrNull / openSecretOrNull", () => {
  it("空は null のまま", () => {
    expect(sealSecretOrNull(null)).toBeNull();
    expect(sealSecretOrNull("")).toBeNull();
    expect(openSecretOrNull(null)).toBeNull();
    expect(openSecretOrNull("")).toBeNull();
  });

  it("値があれば暗号化・復号する", () => {
    const sealed = sealSecretOrNull("token");
    expect(sealed && isSealed(sealed)).toBe(true);
    expect(openSecretOrNull(sealed)).toBe("token");
  });
});
