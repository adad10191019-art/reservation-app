import type { PrismaClient } from "@/generated/prisma/client";
import { isSealedWithCurrentKey, openSecret, sealSecret } from "./secret-box";

/**
 * DB に平文（または古い鍵の版）で残っている秘密の情報を、今の鍵で暗号化し直す。
 *   ・店舗の LINE のチャネルシークレット・送信用アクセストークン
 *   ・Google 連携の refreshToken・accessToken
 *
 * 暗号化を入れる前に保存された値の移し替えと、鍵の入れ替え（secret-box.ts）の両方に使う。
 * 今の鍵で暗号化済みの値には触らないので、何度流しても結果は同じ。
 * 実行は scripts/encrypt-secrets.ts（npm run db:encrypt-secrets）から。
 */

export type SecretMigrationResult = {
  /** 暗号化し直した値の数 */
  tenantFields: number;
  googleFields: number;
};

function reseal(stored: string | null): string | null {
  if (!stored || isSealedWithCurrentKey(stored)) return null;
  return sealSecret(openSecret(stored));
}

export async function encryptStoredSecrets(db: PrismaClient): Promise<SecretMigrationResult> {
  const result: SecretMigrationResult = { tenantFields: 0, googleFields: 0 };

  const tenants = await db.tenant.findMany({
    where: { OR: [{ lineLoginChannelSecret: { not: null } }, { lineMessagingAccessToken: { not: null } }] },
    select: { id: true, lineLoginChannelSecret: true, lineMessagingAccessToken: true },
  });
  for (const tenant of tenants) {
    const data: { lineLoginChannelSecret?: string; lineMessagingAccessToken?: string } = {};
    const secret = reseal(tenant.lineLoginChannelSecret);
    const token = reseal(tenant.lineMessagingAccessToken);
    if (secret) data.lineLoginChannelSecret = secret;
    if (token) data.lineMessagingAccessToken = token;
    const count = Object.keys(data).length;
    if (count === 0) continue;
    // 読んだあとに画面から保存し直された値を、古い値で上書きしないように、読んだときの値のままのときだけ書く
    const updated = await db.tenant.updateMany({
      where: {
        id: tenant.id,
        lineLoginChannelSecret: tenant.lineLoginChannelSecret,
        lineMessagingAccessToken: tenant.lineMessagingAccessToken,
      },
      data,
    });
    if (updated.count > 0) result.tenantFields += count;
  }

  const connections = await db.googleCalendarConnection.findMany({
    select: { employeeId: true, refreshToken: true, accessToken: true },
  });
  for (const connection of connections) {
    const data: { refreshToken?: string; accessToken?: string } = {};
    const refresh = reseal(connection.refreshToken);
    const access = reseal(connection.accessToken);
    if (refresh) data.refreshToken = refresh;
    if (access) data.accessToken = access;
    const count = Object.keys(data).length;
    if (count === 0) continue;
    const updated = await db.googleCalendarConnection.updateMany({
      where: {
        employeeId: connection.employeeId,
        refreshToken: connection.refreshToken,
        accessToken: connection.accessToken,
      },
      data,
    });
    if (updated.count > 0) result.googleFields += count;
  }

  return result;
}

/** 今の鍵で暗号化されていない値がいくつ残っているか（流したあとの確かめ用） */
export async function countUnsealedSecrets(db: PrismaClient): Promise<number> {
  const tenants = await db.tenant.findMany({
    select: { lineLoginChannelSecret: true, lineMessagingAccessToken: true },
  });
  const connections = await db.googleCalendarConnection.findMany({
    select: { refreshToken: true, accessToken: true },
  });
  const values = [
    ...tenants.flatMap((t) => [t.lineLoginChannelSecret, t.lineMessagingAccessToken]),
    ...connections.flatMap((c) => [c.refreshToken, c.accessToken]),
  ];
  return values.filter((v) => v && !isSealedWithCurrentKey(v)).length;
}
