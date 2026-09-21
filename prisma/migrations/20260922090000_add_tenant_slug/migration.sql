-- お客様向けURLに使う短い名前。
-- 既存の店舗は未設定のままでよく、その場合は従来どおり店舗IDで開ける。
ALTER TABLE "Tenant" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
