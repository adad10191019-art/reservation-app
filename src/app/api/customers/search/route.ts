/**
 * 予約登録画面の顧客検索。入力に合わせて画面の部品から呼ぶ。
 *
 * 顧客を全件読み込んで選択肢に並べると、顧客が増えるほど画面が重くなるため、
 * 入力された文字で絞った数件だけを返す。
 * 画面遷移ではなく部品からの呼び出しなので、未ログインでもログイン画面へは
 * 飛ばさず 401 を返す。
 */
import { NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth";
import { searchCustomerCandidates } from "@/lib/customer-search";

export async function GET(request: Request) {
  const session = await getVerifiedSession();
  if (!session) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
  const result = await searchCustomerCandidates(session.tenantId, q);

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
