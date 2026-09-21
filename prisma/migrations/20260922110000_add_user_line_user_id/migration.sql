-- 店舗側（オーナー・スタッフ）が通知を受け取るためのLINE利用者ID。
-- お客様とは別のテーブルで持つ。同じ人が店舗側とお客様側の両方であってもよい。
ALTER TABLE "User" ADD COLUMN "lineUserId" TEXT;

CREATE UNIQUE INDEX "User_tenantId_lineUserId_key" ON "User"("tenantId", "lineUserId");
