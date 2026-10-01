-- 1人1アカウントにする。
-- これまで User が直接持っていた「部署・役割・スタッフ・通知用LINE」を、担当部署の表（Membership）へ移す。
-- 兼任の人は、同じアカウントに担当部署が複数並ぶ形になる。
--
-- 同じメールアドレスのアカウントが2つあると、最後のメールの一意化で止まる（全体が取り消される）。
-- 本番に当てる前に、重なりが無いことを確かめておくこと。

-- 1. 担当部署の表を作る
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "staffId" TEXT,
    "lineUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- 2. 部署のアカウント（オーナー・スタッフ）を、そのまま担当部署1件に移す
INSERT INTO "Membership" ("id", "userId", "tenantId", "role", "staffId", "lineUserId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "tenantId", "role", "staffId", "lineUserId", "createdAt", CURRENT_TIMESTAMP
FROM "User"
WHERE "tenantId" IS NOT NULL AND "role" IN ('owner', 'staff');

-- 3. アカウント側の新しい項目
ALTER TABLE "User"
ADD COLUMN "isGroupAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastTenantId" TEXT,
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "isGroupAdmin" = true WHERE "role" = 'group_admin';
UPDATE "User" SET "lastTenantId" = "tenantId" WHERE "tenantId" IS NOT NULL;

-- 4. スタッフが名簿の人にひも付いていれば、アカウントもその人にひも付ける
--    （「全社の1日」の自分の列を決めるため）。同じ人を指すアカウントが複数あれば古い方だけ
UPDATE "User" AS u
SET "employeeId" = pick."employeeId"
FROM (
  SELECT DISTINCT ON (s."employeeId") u2."id" AS "userId", s."employeeId"
  FROM "User" u2
  JOIN "Staff" s ON s."id" = u2."staffId"
  WHERE s."employeeId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "User" u3 WHERE u3."employeeId" = s."employeeId")
  ORDER BY s."employeeId", u2."createdAt"
) AS pick
WHERE u."id" = pick."userId" AND u."employeeId" IS NULL;

-- 5. 古い項目を外す
ALTER TABLE "User" DROP CONSTRAINT "User_staffId_fkey";
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";
DROP INDEX "User_staffId_key";
DROP INDEX "User_tenantId_email_key";
DROP INDEX "User_tenantId_idx";
DROP INDEX "User_tenantId_lineUserId_key";

ALTER TABLE "User" DROP COLUMN "lineUserId",
DROP COLUMN "role",
DROP COLUMN "staffId",
DROP COLUMN "tenantId";

-- 6. 一意の決まりとつながり
CREATE UNIQUE INDEX "Membership_staffId_key" ON "Membership"("staffId");
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");
CREATE UNIQUE INDEX "Membership_tenantId_lineUserId_key" ON "Membership"("tenantId", "lineUserId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
