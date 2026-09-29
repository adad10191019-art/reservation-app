-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "customerLoginMethod" TEXT;

-- CreateTable
CREATE TABLE "CustomerLoginCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLoginCode_tenantId_email_idx" ON "CustomerLoginCode"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "CustomerLoginCode" ADD CONSTRAINT "CustomerLoginCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
