# 予約管理システム

サロン・クリニック・教室など、**複数のスタッフがいる小規模事業者**向けの予約管理システム。

「予約を登録する」だけでなく、**複数の制約を満たす空き枠を自動で割り出す**ところを中心に据えている。

- スタッフごとに対応できるメニューが違う
- メニューごとに所要時間と片付け時間が違う
- スタッフごとに勤務時間が違う（時短勤務など）
- 昼休憩、臨時休業、短縮営業がある

これらを全部満たしたうえで「指定スタッフの空き枠」と「誰でもいい場合の最短枠」を出す。

## 技術構成

| 領域 | 使用技術 |
|---|---|
| フレームワーク | Next.js 16（App Router） |
| 言語 | TypeScript |
| DB | SQLite（Prisma 7 経由。PostgreSQL へ移行できる設計） |
| スタイル | Tailwind CSS |
| テスト | Vitest |

## セットアップ

```bash
npm install
npx prisma migrate dev
npm run db:seed
```

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動 |
| `npm test` | テストを実行 |
| `npm run check` | 実データで空き枠を出して目視確認 |
| `npm run check:double` | 二重予約が防げているか検証 |
| `npm run db:studio` | DBの中身をブラウザで確認 |
| `npm run db:reset` | DBを作り直してダミーデータを入れ直す（全データが消えます） |
| `npm run typecheck` | 型チェック |

## 設計上の判断

**時刻は「0時からの経過分」の整数で持つ**
`"10:00"` ではなく `600` として保存する。空き枠の計算は引き算の連続なので、文字列のまま扱うと変換のたびに誤りが入る。

**日付は `"YYYY-MM-DD"` の文字列で持つ**
`Date` 型で持つとタイムゾーンによる日付のズレが発生する。日付そのものに時刻の意味はないため、文字列で持つほうが安全。

**予約には「予約時点の値のコピー」を保存する**
メニューの料金や所要時間は後から変わる。参照だけにすると、値上げした瞬間に過去の予約の金額まで書き換わり、売上集計が狂う。

**予約は削除せず `status` を変える（論理削除）**
キャンセル履歴は分析に使う。また、消すと復旧できない。

**全テーブルに `tenantId` を持たせる（マルチテナント）**
1つのシステムを複数の店舗が共有し、データは完全に分離する。検索条件に必ず `tenantId` を入れる。

**空き枠のロジックはDBから切り離す**
`availability-core.ts` はDBを一切触らない純粋な計算だけを持つ。`availability.ts` がDBから値を読んでそこへ渡す。テストがDBなしで実行でき、不具合の切り分けも容易になる。

## 構成

```
prisma/
  schema.prisma              テーブル定義
  seed.ts                    ダミーデータ投入
src/lib/
  time.ts                    時間帯の計算（重なり・引き算・刻み揃え）
  availability-core.ts       空き枠ロジック（DBを触らない）
  availability.ts            DBから読んで上記へ渡す
  booking.ts                 予約の登録・変更・状態変更（重複チェックを含む）
  actions.ts                 フォームの送信先（Server Action）
  prisma.ts                  DB接続
scripts/
  check-availability.ts      実データでの目視確認
  check-double-booking.ts    二重予約が防げているかの検証
docs/
  postgres-schema.sql        PostgreSQL 版スキーマ（生成・参照用）
```

## PostgreSQL へ切り替える（公開するとき）

手元の開発は SQLite で動く。公開先（Vercel などのサーバーレス環境）はファイルが残らないため、
PostgreSQL に切り替える必要がある。スキーマは PostgreSQL でもそのまま作れることを確認済み
（`docs/postgres-schema.sql` が、DBに接続せずに生成した確認結果）。

**1. PostgreSQL を用意する**

Neon・Supabase・Vercel Postgres などの無料枠でよい。接続文字列を控える。

**2. 設定を2か所変える**

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"   // "sqlite" から変更
}
```

```bash
# .env
DATABASE_URL="postgresql://ユーザー名:パスワード@ホスト:5432/データベース名?sslmode=require"
```

接続の切り替えにコード修正は要らない。`src/lib/prisma.ts` が `DATABASE_URL` の
書き出し（`file:` か `postgres://` か）を見て、使うドライバを自動で選ぶ。

**3. マイグレーションを作り直す**

既存の `prisma/migrations/` は SQLite 向けのSQLなので、PostgreSQL には流せない。

```bash
rm -rf prisma/migrations
npx prisma migrate dev --name init
npm run db:seed
```

### 公開先での設定

- 環境変数に `DATABASE_URL` を設定する
- ビルドコマンドは `npm run build`（`postinstall` で `prisma generate` が走る）
- `.env` と `*.db` はリポジトリに含まれない（`.gitignore` 済み）

### 公開前に必要なこと

- **ログイン機能がない。** 今は最初の店舗を自動で使う暫定実装なので、
  URLを知っていれば誰でも予約を操作できる。一般公開の前に認証が必須。
- 予約を取る側（お客様向け）の画面はまだない。現状は店舗側の管理画面のみ。

## 進捗

- [x] テーブル設計・ダミーデータ（分割シフト対応）
- [x] 空き枠ロジック＋テスト
- [x] 予約カレンダー画面（日表示）
- [x] 空き枠検索・予約登録画面（二重予約の防止つき）
- [x] 予約の詳細・日時変更・キャンセル
- [ ] 各種設定画面
- [ ] ログイン・権限
- [ ] マルチテナントの検証
- [x] PostgreSQL 対応・デプロイ準備
- [ ] デプロイ（公開先の用意）
- [ ] LINE連携（予約通知・リマインド）
