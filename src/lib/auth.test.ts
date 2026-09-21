import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import {
  canEditSettings,
  canManageStaffReservation,
  type Actor,
} from "./permissions";
import {
  SESSION_MAX_AGE_SECONDS,
  type SessionData,
  buildSession,
  decodeSession,
  encodeSession,
} from "./session";

const SECRET = "test-secret-at-least-16-chars";

describe("パスワード", () => {
  it("正しいパスワードだけ通る", async () => {
    const stored = await hashPassword("password123");
    expect(await verifyPassword("password123", stored)).toBe(true);
    expect(await verifyPassword("password124", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("同じパスワードでも保存される値は毎回違う", async () => {
    const a = await hashPassword("password123");
    const b = await hashPassword("password123");
    expect(a).not.toBe(b);
    // それでも両方とも照合できる
    expect(await verifyPassword("password123", a)).toBe(true);
    expect(await verifyPassword("password123", b)).toBe(true);
  });

  it("元のパスワードが保存値に含まれない", async () => {
    const stored = await hashPassword("password123");
    expect(stored).not.toContain("password123");
    expect(stored.startsWith("scrypt$")).toBe(true);
  });

  it("壊れた保存値は通らない", async () => {
    expect(await verifyPassword("password123", "")).toBe(false);
    expect(await verifyPassword("password123", "password123")).toBe(false);
    expect(await verifyPassword("password123", "md5$aaa$bbb")).toBe(false);
    expect(await verifyPassword("password123", "scrypt$$")).toBe(false);
  });
});

describe("セッション", () => {
  const base: SessionData = {
    userId: "u1",
    tenantId: "t1",
    role: "staff",
    staffId: "s1",
    name: "佐藤",
    exp: Date.now() + 60_000,
  };

  it("署名して戻すと元に戻る", () => {
    const token = encodeSession(base, SECRET);
    expect(decodeSession(token, SECRET)).toEqual(base);
  });

  it("中身を書き換えると無効になる", () => {
    const token = encodeSession(base, SECRET);
    const [payload, signature] = token.split(".");

    // role を owner に書き換えて、署名はそのまま使う
    const tampered = JSON.parse(Buffer.from(payload, "base64url").toString());
    tampered.role = "owner";
    const forged =
      Buffer.from(JSON.stringify(tampered)).toString("base64url") + "." + signature;

    expect(decodeSession(forged, SECRET)).toBeNull();
  });

  it("別の秘密鍵では読めない", () => {
    const token = encodeSession(base, SECRET);
    expect(decodeSession(token, "another-secret-16-chars-long")).toBeNull();
  });

  it("期限が切れていれば無効", () => {
    const token = encodeSession(base, SECRET);
    // 有効期限の1ミリ秒後
    expect(decodeSession(token, SECRET, base.exp + 1)).toBeNull();
    expect(decodeSession(token, SECRET, base.exp - 1)).not.toBeNull();
  });

  it("壊れた値や空の値は無効", () => {
    expect(decodeSession(undefined, SECRET)).toBeNull();
    expect(decodeSession("", SECRET)).toBeNull();
    expect(decodeSession("abc", SECRET)).toBeNull();
    expect(decodeSession(".abc", SECRET)).toBeNull();
  });

  it("buildSession は有効期限を先に置く", () => {
    const now = 1_000_000;
    const session = buildSession(
      { userId: "u1", tenantId: "t1", role: "owner", staffId: null, name: "店長" },
      now,
    );
    expect(session.exp).toBe(now + SESSION_MAX_AGE_SECONDS * 1000);
  });
});

describe("権限", () => {
  const owner: Actor = { role: "owner", staffId: null };
  const sato: Actor = { role: "staff", staffId: "sato" };
  const detached: Actor = { role: "staff", staffId: null };

  it("オーナーは誰の予約でも操作できる", () => {
    expect(canManageStaffReservation(owner, "sato")).toBe(true);
    expect(canManageStaffReservation(owner, "suzuki")).toBe(true);
  });

  it("スタッフは自分の担当分だけ操作できる", () => {
    expect(canManageStaffReservation(sato, "sato")).toBe(true);
    expect(canManageStaffReservation(sato, "suzuki")).toBe(false);
  });

  it("スタッフに紐づかないアカウントは誰の予約も操作できない", () => {
    expect(canManageStaffReservation(detached, "sato")).toBe(false);
  });

  it("設定を変更できるのはオーナーだけ", () => {
    expect(canEditSettings(owner)).toBe(true);
    expect(canEditSettings(sato)).toBe(false);
  });
});
