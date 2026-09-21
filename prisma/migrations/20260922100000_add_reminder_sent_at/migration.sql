-- 前日リマインドを送った日時。
-- 送信済みかどうかを記録しておかないと、実行するたびに何度も送ってしまう。
ALTER TABLE "Reservation" ADD COLUMN "reminderSentAt" DATETIME;
