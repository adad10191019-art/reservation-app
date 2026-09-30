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
- 公開先は Vercel。**開発と本番は同じ Neon DB を共有している**（seed やマイグレーションは本番にも効く）

設計上の判断や詳しい手順は README.md を参照。

## 使っている技術

- Next.js 16（App Router）、React 19、TypeScript
- PostgreSQL（Neon）＋ Prisma 7（`@prisma/adapter-pg`）。生成先は `src/generated/prisma`
- Tailwind CSS 4、Vitest（`npm test`）、tsx（`scripts/` の検証スクリプト）
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

## 次にやることの候補（2026-09-30 時点）

1. 本番の安全対策：ダミーアカウント（`password123`）の削除、Vercel の二要素認証、開発用と本番用のDB分離
2. 前日リマインドの自動実行（Vercel Cron から呼べる API を作り、秘密のトークンで保護する）
3. 細かい整理：`NEXT_PUBLIC_LIFF_ID` を `.env.example` に追加、`src/app/settings/hours/page.tsx` の
   「日付ごとの設定の画面は今後追加します」という古い文言、`next.config.ts` に残る SQLite 用の指定
4. LINE 公式アカウント名をテスト名「竹」から変更（LINE 側の設定作業）
5. メール送信ドメインの認証（LINE 以外のクライアントが出てきたとき）
6. 店舗ごとの LINE 認証情報の暗号化（外部に販売する段階で）
7. DB を使う処理（`booking.ts`、`calendar-actions.ts` など）の自動テスト追加
