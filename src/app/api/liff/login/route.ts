/**
 * LIFF（LINEアプリの中で開く予約ページ）からの自動ログイン。
 *
 * LIFFのSDKがLINEアプリの中で直接取得したIDトークンを受け取り、
 * LINEに問い合わせて本人確認したうえでログイン状態にする。
 * 画面遷移（OAuthの同意画面）を挟まないので、開いた瞬間にログイン済みにできる。
 */
import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE, CUSTOMER_MAX_AGE_SECONDS, buildCustomerSession, encodeCustomerSession } from "@/lib/customer-session";
import { upsertLineCustomer } from "@/lib/customer-store";
import { resolveLiffId, verifyLiffIdToken } from "@/lib/line";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  let body: { tenantId?: string; idToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "リクエストの形式が正しくありません" }, { status: 400 });
  }

  const tenantId = String(body.tenantId ?? "");
  const idToken = String(body.idToken ?? "");
  if (!tenantId || !idToken) {
    return NextResponse.json({ ok: false, message: "パラメータが不足しています" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return NextResponse.json({ ok: false, message: "店舗が見つかりません" }, { status: 404 });
  }
  if (!resolveLiffId(tenant)) {
    return NextResponse.json({ ok: false, message: "LIFFの設定がまだです" }, { status: 400 });
  }

  let profile;
  try {
    profile = await verifyLiffIdToken(tenant, idToken);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "本人確認に失敗しました" },
      { status: 401 },
    );
  }

  const customer = await upsertLineCustomer({
    tenantId,
    lineUserId: profile.userId,
    displayName: profile.displayName,
  });

  const session = buildCustomerSession({ customerId: customer.id, tenantId, name: customer.name });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(CUSTOMER_COOKIE, encodeCustomerSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CUSTOMER_MAX_AGE_SECONDS,
  });
  return response;
}
