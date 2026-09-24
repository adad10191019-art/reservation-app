-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "calendarToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Staff_calendarToken_key" ON "Staff"("calendarToken");
