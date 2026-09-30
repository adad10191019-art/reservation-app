/**
 * DB の接続先が本番かどうかの判定。
 *
 * 開発用と本番用は Neon の別ブランチに分けてあり、手元の .env は開発用
 * （development ブランチ）を向いている。データを作り直す seed / reset や、
 * データを書き込む DB テストを本番に向けて流さないよう、ここで見分ける。
 *
 * 本番ブランチのコンピュートを作り直してホスト名が変わったら、ここも直す。
 */

export const PRODUCTION_HOST_PREFIX = "ep-orange-pond-b3d859bd";

const URL_NAMES = ["DATABASE_URL", "DIRECT_URL"] as const;

/** 本番を向いている接続先の一覧（変数名とホスト名）。空なら本番は向いていない */
export function productionTargets(
  env: Record<string, string | undefined>,
): { name: string; host: string }[] {
  const hits: { name: string; host: string }[] = [];
  for (const name of URL_NAMES) {
    const url = env[name];
    if (!url) continue;

    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }

    if (host.startsWith(PRODUCTION_HOST_PREFIX)) hits.push({ name, host });
  }
  return hits;
}
