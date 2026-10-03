-- お客様に担当を選ばせるか（部署ごと）。今ある部署は今まで通り「選べる」で始める。
ALTER TABLE "Tenant" ADD COLUMN "staffSelection" TEXT NOT NULL DEFAULT 'choose';
