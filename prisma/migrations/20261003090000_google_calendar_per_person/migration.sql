-- Google カレンダー連携の持ち主を「部署の担当（Staff）」から「人（社員名簿 Employee）」へ付け替える。
-- 今つないでいる分は、その担当がひも付いている名簿の人へ移す。
-- 名簿とひも付いていない担当の連携は移す先が無いので消える（本人がアカウント情報からつなぎ直す）。
-- 兼任で同じ人が複数の部署からつないでいた場合は、いちばん新しい1件だけ残す。
-- （本番で移行前につないでいたのは1件だけ。ユーザーと確認済み、2026-10-03）

-- 1. 移す先（名簿の人）を書き込む
ALTER TABLE "GoogleCalendarConnection" ADD COLUMN "employeeId" TEXT;

UPDATE "GoogleCalendarConnection" AS g
SET "employeeId" = s."employeeId"
FROM "Staff" AS s
WHERE s."id" = g."staffId";

DELETE FROM "GoogleCalendarConnection" WHERE "employeeId" IS NULL;

DELETE FROM "GoogleCalendarConnection" AS g
USING "GoogleCalendarConnection" AS newer
WHERE g."employeeId" = newer."employeeId"
  AND (g."updatedAt", g."staffId") < (newer."updatedAt", newer."staffId");

-- 2. 部署・担当とのつながりを外す
ALTER TABLE "GoogleCalendarConnection" DROP CONSTRAINT "GoogleCalendarConnection_staffId_fkey";
ALTER TABLE "GoogleCalendarConnection" DROP CONSTRAINT "GoogleCalendarConnection_tenantId_fkey";
DROP INDEX "GoogleCalendarConnection_tenantId_idx";

ALTER TABLE "GoogleCalendarConnection" DROP CONSTRAINT "GoogleCalendarConnection_pkey",
DROP COLUMN "staffId",
DROP COLUMN "tenantId",
ALTER COLUMN "employeeId" SET NOT NULL,
ADD COLUMN "showTitles" BOOLEAN NOT NULL DEFAULT false,
ADD CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("employeeId");

ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. 全体スケジュールに出す Google の予定を少しの間だけ覚えておく表
CREATE TABLE "GoogleEventCache" (
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleEventCache_pkey" PRIMARY KEY ("employeeId","date")
);

ALTER TABLE "GoogleEventCache" ADD CONSTRAINT "GoogleEventCache_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
