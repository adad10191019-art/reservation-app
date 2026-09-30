/**
 * お客様に見せるログイン方法の決め方（resolveCustomerLoginMethods）と、
 * メールが届く設定かの判定（isEmailConfigured）を確かめる。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailConfigured } from "./email";
import { resolveCustomerLoginMethods } from "./email-login";

vi.mock("./prisma", () => ({ prisma: {} }));

const LINE = { lineLoginChannelId: "id", lineLoginChannelSecret: "secret" };
const NO_LINE = { lineLoginChannelId: null, lineLoginChannelSecret: null };

function stubEmail(from: string | undefined) {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", from);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isEmailConfigured", () => {
  it("キーと自分のドメインの送信元があれば使える", () => {
    stubEmail("予約 <notify@example.com>");
    expect(isEmailConfigured()).toBe(true);
  });

  it("送信元が Resend のテスト用アドレスのままなら使えない", () => {
    stubEmail("予約 <onboarding@resend.dev>");
    expect(isEmailConfigured()).toBe(false);
  });

  it("送信元が無ければ使えない", () => {
    stubEmail(undefined);
    expect(isEmailConfigured()).toBe(false);
  });

  it("キーが無ければ使えない", () => {
    vi.stubEnv("RESEND_API_KEY", undefined);
    vi.stubEnv("EMAIL_FROM", "notify@example.com");
    expect(isEmailConfigured()).toBe(false);
  });
});

describe("resolveCustomerLoginMethods", () => {
  it("メールが届く設定なら、「両方」でメール欄も出す", () => {
    stubEmail("notify@example.com");
    expect(resolveCustomerLoginMethods({ ...LINE, customerLoginMethod: "both" })).toEqual({
      line: true,
      email: true,
    });
  });

  it("送信元がテスト用のままなら、「メールのみ」「両方」でもメール欄を出さない", () => {
    stubEmail("onboarding@resend.dev");
    expect(resolveCustomerLoginMethods({ ...LINE, customerLoginMethod: "email" })).toEqual({
      line: false,
      email: false,
    });
    expect(resolveCustomerLoginMethods({ ...LINE, customerLoginMethod: "both" })).toEqual({
      line: true,
      email: false,
    });
  });

  it("「自動」でLINEが無いときは、メールが届く設定の場合だけメールにする", () => {
    stubEmail("notify@example.com");
    expect(resolveCustomerLoginMethods({ ...NO_LINE, customerLoginMethod: null })).toEqual({
      line: false,
      email: true,
    });
    stubEmail("onboarding@resend.dev");
    expect(resolveCustomerLoginMethods({ ...NO_LINE, customerLoginMethod: null })).toEqual({
      line: false,
      email: false,
    });
  });
});
