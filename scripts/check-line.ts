/**
 * LINEの設定が正しく読めているかを確かめる。
 *
 *   npm run check:line
 *
 * メッセージは送らない。公式アカウントの情報を問い合わせて、
 * トークンが有効かどうかだけを見る。
 * トークンそのものは画面に出さない（実質パスワードのため）。
 */
import "dotenv/config";

const BOT_INFO_URL = "https://api.line.me/v2/bot/info";

function mask(value: string | undefined): string {
  if (!value) return "未設定";
  return `設定あり（${value.length}文字、末尾 ...${value.slice(-4)}）`;
}

async function main() {
  console.log("=== 設定の読み込み ===");
  console.log(`APP_URL                     : ${process.env.APP_URL ?? "未設定"}`);
  console.log(`LINE_LOGIN_CHANNEL_ID       : ${process.env.LINE_LOGIN_CHANNEL_ID ?? "未設定"}`);
  console.log(`LINE_LOGIN_CHANNEL_SECRET   : ${mask(process.env.LINE_LOGIN_CHANNEL_SECRET)}`);
  console.log(`LINE_MESSAGING_ACCESS_TOKEN : ${mask(process.env.LINE_MESSAGING_ACCESS_TOKEN)}`);
  console.log("");

  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) {
    console.log("公式アカウントのトークンが未設定です。通知は送られません。");
    return;
  }

  console.log("=== 公式アカウントへの問い合わせ ===");
  const response = await fetch(BOT_INFO_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.log(`NG トークンが使えませんでした（${response.status}）`);
    console.log(detail.slice(0, 300));
    if (response.status === 401) {
      console.log("\n→ トークンが違うか、期限切れの可能性があります。発行し直してください。");
    }
    process.exitCode = 1;
    return;
  }

  const info = (await response.json()) as {
    displayName?: string;
    basicId?: string;
    userId?: string;
    chatMode?: string;
  };

  console.log("OK トークンは有効です");
  console.log(`  公式アカウント名 : ${info.displayName ?? "(不明)"}`);
  console.log(`  ベーシックID     : ${info.basicId ?? "(不明)"}`);
  console.log(`  応答モード       : ${info.chatMode ?? "(不明)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
