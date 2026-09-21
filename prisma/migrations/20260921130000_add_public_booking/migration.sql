-- お客様向けの予約受付の条件を店舗に追加
ALTER TABLE "Tenant" ADD COLUMN "bookingWindowDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Tenant" ADD COLUMN "bookingLeadMinutes" INTEGER NOT NULL DEFAULT 120;

-- 同じ人が同じ店舗で二重に作られないようにする。
-- lineUserId が NULL の行は複数あってよい（SQLite/PostgreSQL とも同じ扱い）。
CREATE UNIQUE INDEX "Customer_tenantId_lineUserId_key" ON "Customer"("tenantId", "lineUserId");
