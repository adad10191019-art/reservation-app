import { describe, expect, it } from "vitest";
import { normalizeName, normalizePhone, validateCustomerProfile } from "./customer-profile";

describe("normalizeName", () => {
  it("前後の空白を落とし、途中の全角・連続の空白を半角1つにまとめる", () => {
    expect(normalizeName("  山田　 花子 ")).toBe("山田 花子");
  });
});

describe("normalizePhone", () => {
  it("空なら null", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("　 ")).toBeNull();
  });

  it("全角数字・いろいろな横棒・空白を半角にそろえる", () => {
    expect(normalizePhone("０９０ー１２３４－５６７８")).toBe("090-1234-5678");
    expect(normalizePhone("090 1234 5678")).toBe("09012345678");
    expect(normalizePhone("＋81 90-1234-5678")).toBe("+8190-1234-5678");
  });
});

describe("validateCustomerProfile", () => {
  it("名前だけでも通り、電話番号は null になる", () => {
    expect(validateCustomerProfile({ name: "山田 花子", phone: "" })).toEqual({
      ok: true,
      value: { name: "山田 花子", phone: null },
    });
  });

  it("名前と電話番号を整えて返す", () => {
    expect(validateCustomerProfile({ name: " 山田　花子 ", phone: "０９０-１２３４-５６７８" })).toEqual({
      ok: true,
      value: { name: "山田 花子", phone: "090-1234-5678" },
    });
  });

  it("名前が空なら断る", () => {
    const r = validateCustomerProfile({ name: "　", phone: "" });
    expect(r.ok).toBe(false);
  });

  it("記号や絵文字だけの名前は断る", () => {
    expect(validateCustomerProfile({ name: "★☆", phone: "" }).ok).toBe(false);
    expect(validateCustomerProfile({ name: "🌸🌸", phone: "" }).ok).toBe(false);
  });

  it("長すぎる名前は断る", () => {
    expect(validateCustomerProfile({ name: "あ".repeat(51), phone: "" }).ok).toBe(false);
    expect(validateCustomerProfile({ name: "あ".repeat(50), phone: "" }).ok).toBe(true);
  });

  it("電話番号の桁数や文字がおかしければ断る", () => {
    expect(validateCustomerProfile({ name: "山田", phone: "090-1234" }).ok).toBe(false);
    expect(validateCustomerProfile({ name: "山田", phone: "090-1234-abcd" }).ok).toBe(false);
    expect(validateCustomerProfile({ name: "山田", phone: "1".repeat(16) }).ok).toBe(false);
  });

  it("固定電話・+81 の書き方は通す", () => {
    expect(validateCustomerProfile({ name: "山田", phone: "03-1234-5678" }).ok).toBe(true);
    expect(validateCustomerProfile({ name: "山田", phone: "+81-90-1234-5678" }).ok).toBe(true);
  });
});
