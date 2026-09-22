-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "lineLoginChannelId" TEXT,
ADD COLUMN     "lineLoginChannelSecret" TEXT,
ADD COLUMN     "lineMessagingAccessToken" TEXT;
