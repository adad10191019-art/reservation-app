-- Google カレンダーの連携が切れた（Google が許可を無効と返した）時刻を残す。
-- 切れたまま気づかないと、予約受付が Google の予定を見ずに枠を出してしまうため、画面で知らせる。
ALTER TABLE "GoogleCalendarConnection" ADD COLUMN "brokenAt" TIMESTAMP(3);
