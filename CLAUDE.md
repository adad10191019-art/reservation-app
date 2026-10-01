@AGENTS.md

## アプリの概要

複数のスタッフがいる小規模事業者（サロン・クリニック・教室など）向けの予約管理システム。
中心は「スタッフごとの対応メニュー・勤務時間・休憩・臨時休業などを全部満たす空き枠の自動計算」。

- 店舗側：予約カレンダー（日・週、ドラッグで移動）、予約の登録・変更・キャンセル、設定画面、
  自分の予定、顧客一覧、集計・CSV、変更履歴、導入チェックリスト、部署の追加・解約
- お客様側：`/book/[shop]` の予約画面（担当指名、1週間の空き状況、確認画面、自分の予約の確認・キャンセル）。
  ログインは LINE／メールのワンタイムコード／LIFF から店舗ごとに選択
- 通知：LINE（予約完了・キャンセル・前日リマインド）、LINE未連携の店舗側にはメール
- マルチテナント（全テーブルに `tenantId`）。役割は owner / staff / group_admin
- 公開先は Vercel。**開発用と本番用の DB は Neon のブランチで分離済み（2026-09-28）**。
  本番＝`production` ブランチ（ホスト `ep-orange-pond-b3d859bd`、Vercel の Production）、
  開発＝`development` ブランチ（ホスト `ep-calm-truth-b3uxvk62`、手元の `.env`）。
  **DB 分離の作業はもう不要。** 手元の `.env` で調べた結果は本番の状態ではない
  （本番を見るときは Neon の production の接続文字列を一時ファイルで使い、終わったら消す）。
  本番を向いた `db:seed`・`db:reset` は `scripts/guard-not-production.ts` が止める

設計上の判断や詳しい手順は README.md を参照。

## セッションの進め方

作業は「1セッション＝1テーマ」で区切る。前のセッションの会話は引き継がれないので、状態はファイルに残す。

- **始めるとき**：下の「次にやることの候補」、`git status`、`git log --oneline -5` を見て、
  前回どこまで進んだかをひとこと報告してから作業に入る
- **キリがついたとき**（ユーザーが「締めて」「今日はここまで」と言ったとき）：
  1. README.md の「進捗」に完了したことを足し、「未完了」を今の状態に合わせる
  2. このファイルの「次にやることの候補」を更新し、見出しの日付を今日にする
  3. 変更をコミットする（ブランチを切っていれば、main へのマージが必要かも伝える）
  4. 次のセッションの名前の案（例：「前日リマインドの自動実行」）を出す

## 使っている技術

- Next.js 16（App Router）、React 19、TypeScript
- PostgreSQL（Neon）＋ Prisma 7（`@prisma/adapter-pg`）。生成先は `src/generated/prisma`
- Tailwind CSS 4、Vitest（`npm test`、DB を使うものは `npm run test:db` で開発用DBに流す）、tsx（`scripts/` の検証スクリプト）
- Resend（メール）、Sentry（エラー監視）
- LINE ログイン／Messaging API／LIFF、Google Calendar API
- デプロイ時は `vercel-build`（`prisma migrate deploy && next build`）が走る

## 環境変数（名前のみ。値は `.env`、書式は `.env.example`）

- 必須：`DATABASE_URL`、`DIRECT_URL`、`AUTH_SECRET`、`APP_URL`
- LINE：`LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`、`LINE_MESSAGING_ACCESS_TOKEN`、`NEXT_PUBLIC_LIFF_ID`
- Google：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`
- メール：`RESEND_API_KEY`、`EMAIL_FROM`

LINE・Google・メールは未設定でも動く（仮ログイン／機能非表示／ログ出力のみに切り替わる）。
`NEXT_PUBLIC_LIFF_ID` はまだ `.env.example` に載っていない。

## 次にやることの候補（2026-10-01 時点）

0. **（ユーザーの作業）** Vercel の Cron Jobs → View Logs に `[前日リマインド]` と `[ログイン失敗の掃除] ○件を削除` が出ているか確認
   （401 なら `CRON_SECRET` の設定不良）。毎日 18:00（日本時間）に動く。無料プランでログがどれだけ残るかは未確認なので、実行後すぐ見るのが確実
1. **（ユーザーの作業）** 本番のスタッフ「担当者A〜C」（就活のイロハ・youth光回線案内）を 設定→スタッフ で無効にする。
   就活のイロハの担当者Aには予約2件があるので、中身を確認してから
2. **（ユーザーの作業）** LINE 公式アカウント名をテスト名「竹」から変更（LINE 側の設定作業）
3. **（ユーザーの作業）** 本名・電話番号の入力を main に取り込んだ後、本番で1回予約して確認画面の入力欄と、
   店舗側の顧客一覧に電話番号が出ることを確かめる（マイグレーション `20260930120000_add_customer_entered_name` はデプロイで自動適用）
4. DB テスト（`npm run test:db`）の範囲を広げる（部署の解約 `tenant-offboarding.ts`、お客様のメールログイン `email-login.ts` など）
5. メール送信ドメインの認証（LINE 以外のクライアントが出てきたとき）。
   あわせて、確認コードの送信に店舗全体の上限を付け、店舗側の「パスワードを忘れた方」（メールで再設定）を作る。
   **認証して `EMAIL_FROM` を変えたら、`src/lib/email.ts` の一時的な判定 `isResendTestSender` を外す**
   （テスト用送信元の間、お客様のメールログイン欄を出さないための安全装置）
6. 店舗ごとの LINE 認証情報の暗号化（外部に販売する段階で）
7. 設定画面の「お客様向けURLの短い名前」を「URL名」に言い換えるか検討（仕様書は「URL名」に統一した）
8. 店舗側で顧客の名前・電話番号を直せる編集画面（今は表示だけ。電話受付で聞いた番号を足せない）

済み（2026-10-01）：予約時の本名・電話番号の入力（確認画面、`lineDisplayName`／`nameEnteredAt`、顧客一覧・詳細、
プライバシーポリシー、仕様書の更新）

済み（2026-09-30）：二要素認証（GitHub・Neon・Vercel・Google）、DB テストの追加、予約登録画面の顧客検索、
ログイン失敗の記録の自動掃除、テスト用送信元の間はメールログイン欄を出さない安全装置、仕様書の作成（claude.ai の Docs）
