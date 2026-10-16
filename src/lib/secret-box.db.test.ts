/**
 * 秘密の情報（LINE・Google の鍵）の暗号化を開発用 DB で確かめる。
 *   ・平文で残っている値を移し替えスクリプトの処理で暗号化でき、2回目は何も変えない
 *   ・暗号化して保存した LINE の送信用トークン・Google の鍵が、外へ送るときには元の値に戻っている
 *   ・Google のアクセストークンを取り直したら、暗号化して保存し直す
 *
 * LINE・Google へは本当に送らないよう fetch を差し替え、送ろうとした中身を見る。
 * 移し替えの処理は開発用 DB の全店舗に効く（平文が残っていれば、開発用の鍵で暗号化される）。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchGoogleBusyByDate, removeGoogleConnection } from "./google-calendar";
import { pushTextMessage } from "./line-messaging";
import { prisma } from "./prisma";
import { isSealed, openSecret, sealSecret } from "./secret-box";
import { countUnsealedSecrets, encryptStoredSecrets } from "./secret-migration";
import {
  TEST_DATE,
  type TestShop,
  createTestEmployee,
  createTestShop,
  deleteLeftoverTestShops,
  deleteTestEmployees,
  deleteTestShop,
} from "@/test/db-fixture";

let shop: TestShop;

beforeAll(async () => {
  if (!process.env.DATA_ENCRYPTION_KEY) {
    throw new Error("DATA_ENCRYPTION_KEY が設定されていません。開発用の .env に足してください");
  }
  await deleteLeftoverTestShops();
  shop = await createTestShop("secret-box");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await deleteTestShop(shop.tenantId);
  await deleteTestEmployees();
});

describe("平文で残っている値の移し替え", () => {
  it("店舗の LINE の鍵と Google の鍵を暗号化し、2回目は何も変えない", async () => {
    await prisma.tenant.update({
      where: { id: shop.tenantId },
      data: { lineLoginChannelSecret: "plain-channel-secret", lineMessagingAccessToken: "plain-push-token" },
    });
    const employee = await createTestEmployee("secret-box 移し替え");
    await prisma.googleCalendarConnection.create({
      data: {
        employeeId: employee.id,
        googleEmail: "test@example.com",
        refreshToken: "1//plain-refresh",
        accessToken: "ya29.plain-access",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const first = await encryptStoredSecrets(prisma);
    expect(first.tenantFields).toBeGreaterThanOrEqual(2);
    expect(first.googleFields).toBeGreaterThanOrEqual(2);
    expect(await countUnsealedSecrets(prisma)).toBe(0);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: shop.tenantId } });
    const connection = await prisma.googleCalendarConnection.findUniqueOrThrow({
      where: { employeeId: employee.id },
    });
    for (const [stored, plain] of [
      [tenant.lineLoginChannelSecret, "plain-channel-secret"],
      [tenant.lineMessagingAccessToken, "plain-push-token"],
      [connection.refreshToken, "1//plain-refresh"],
      [connection.accessToken, "ya29.plain-access"],
    ] as const) {
      expect(stored && isSealed(stored)).toBe(true);
      expect(stored).not.toContain(plain);
      expect(openSecret(stored as string)).toBe(plain);
    }

    const second = await encryptStoredSecrets(prisma);
    expect(second).toEqual({ tenantFields: 0, googleFields: 0 });
    const again = await prisma.tenant.findUniqueOrThrow({ where: { id: shop.tenantId } });
    expect(again.lineLoginChannelSecret).toBe(tenant.lineLoginChannelSecret);
  });
});

describe("暗号化した鍵を使う処理", () => {
  it("LINE の通知は、元に戻したトークンで送る", async () => {
    await prisma.tenant.update({
      where: { id: shop.tenantId },
      data: { lineMessagingAccessToken: sealSecret("push-token-123") },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: shop.tenantId } });
    const result = await pushTextMessage({ tenant, to: "U123", text: "テスト" });

    expect(result).toMatchObject({ ok: true, sent: true });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer push-token-123");
  });

  it("Google のアクセストークンを取り直したら、元の refreshToken で頼み、新しい値は暗号化して保存する", async () => {
    const employee = await createTestEmployee("secret-box 取り直し");
    await prisma.googleCalendarConnection.create({
      data: {
        employeeId: employee.id,
        googleEmail: "test@example.com",
        refreshToken: sealSecret("1//refresh-abc"),
        accessToken: sealSecret("ya29.old"),
        accessTokenExpiresAt: new Date(Date.now() - 1000), // 期限切れ
      },
    });

    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("oauth2.googleapis.com/token")) {
          return Response.json({ access_token: "ya29.new", expires_in: 3600 });
        }
        return Response.json({ calendars: { primary: { busy: [] } } });
      }),
    );

    const connection = await prisma.googleCalendarConnection.findUniqueOrThrow({
      where: { employeeId: employee.id },
    });
    await fetchGoogleBusyByDate(connection, [TEST_DATE]);

    const tokenCall = calls.find((c) => c.url.includes("oauth2.googleapis.com/token"));
    expect(String(tokenCall?.init.body)).toContain("refresh_token=1%2F%2Frefresh-abc");
    const busyCall = calls.find((c) => c.url.includes("freeBusy"));
    expect((busyCall?.init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.new");

    const saved = await prisma.googleCalendarConnection.findUniqueOrThrow({
      where: { employeeId: employee.id },
    });
    expect(saved.accessToken && isSealed(saved.accessToken)).toBe(true);
    expect(openSecret(saved.accessToken as string)).toBe("ya29.new");
  });

  it("期限内の暗号化したアクセストークンは、取り直さずに元に戻して使う", async () => {
    const employee = await createTestEmployee("secret-box 使い回し");
    await prisma.googleCalendarConnection.create({
      data: {
        employeeId: employee.id,
        googleEmail: "test@example.com",
        refreshToken: sealSecret("1//refresh-def"),
        accessToken: sealSecret("ya29.still-valid"),
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ calendars: { primary: { busy: [] } } }));
    vi.stubGlobal("fetch", fetchMock);

    const connection = await prisma.googleCalendarConnection.findUniqueOrThrow({
      where: { employeeId: employee.id },
    });
    await fetchGoogleBusyByDate(connection, [TEST_DATE]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.still-valid");
  });

  it("連携を外すと、元に戻した refreshToken で Google に取り消しを伝える", async () => {
    const employee = await createTestEmployee("secret-box 外す");
    await prisma.googleCalendarConnection.create({
      data: {
        employeeId: employee.id,
        googleEmail: "test@example.com",
        refreshToken: sealSecret("1//refresh-revoke"),
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await removeGoogleConnection(employee.id);

    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as URLSearchParams;
    expect(body.get("token")).toBe("1//refresh-revoke");
    expect(await prisma.googleCalendarConnection.count({ where: { employeeId: employee.id } })).toBe(0);
  });
});
