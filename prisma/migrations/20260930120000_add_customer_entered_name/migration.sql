-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "lineDisplayName" TEXT,
ADD COLUMN "nameEnteredAt" TIMESTAMP(3);

-- 既存の LINE のお客様は、今の name が LINE の表示名そのもの
UPDATE "Customer" SET "lineDisplayName" = "name" WHERE "lineUserId" IS NOT NULL;

-- メールログインのお客様は、ログイン時に自分で名前を入力している
UPDATE "Customer" SET "nameEnteredAt" = "createdAt" WHERE "lineUserId" IS NULL AND "email" IS NOT NULL;
