import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * 全ページに付ける、ブラウザへの守り方の指示。
 *
 * CSP（読み込んでよい先の指定）は、スクリプトの読み込み先までは絞っていない。
 * 絞るには毎回の表示ごとに合言葉（nonce）を発行する作りが要り、LIFF・Sentry などを
 * 1つずつ確かめる必要があるため。ここでは壊れる心配の無いものだけ入れる。
 * form-action も入れていない（LINE・Google のログインへの移動が止まるおそれがあるため）。
 */
const SECURITY_HEADERS = [
  {
    // ほかのサイトにこの画面を埋め込ませない（透明な画面を重ねて押させる攻撃を防ぐ）・
    // 書き換えられた <base> で読み込み先を差し替えさせない・古いプラグインを動かさない
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  // frame-ancestors を知らない古いブラウザ向けの、埋め込み禁止
  { key: "X-Frame-Options", value: "DENY" },
  // ファイルの種類をブラウザに推測させない（画像のふりをしたスクリプトを動かさない）
  { key: "X-Content-Type-Options", value: "nosniff" },
  // ほかのサイトへ移るとき、URL のうちドメインだけを伝える（予約の URL などを漏らさない）
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 使わないカメラ・マイク・位置情報を、ページから使えなくする
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // 2年間は HTTPS でしかつながないよう覚えさせる（Vercel も付けるが、念のため明示）。
  // includeSubDomains は付けない（会社のドメインの下に置いたとき、ほかのサブドメインまで縛るため）
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  // DBのドライバはネイティブモジュールを含むため、
  // バンドルに取り込まず、実行時にそのまま読み込ませる。
  // これを外すと公開先でのビルドが落ちることがある。
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
  // 応答に「X-Powered-By: Next.js」を付けない（使っている部品を外に教えない）
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default withSentryConfig(nextConfig, {
  org: "youth-personnel",
  project: "reservation-app",
  // ソースマップのアップロードには認証トークンが要る。
  // 未設定の間はアップロードをスキップするだけで、エラー監視自体は動く
  silent: true,
});
