/**
 * 新規クライアント（部署）を導入するときのセットアップ状況。
 *
 * 今までは「部署作成 → LINE設定 → スタッフ登録 → メニュー設定 → 営業時間 →
 * ログインアカウント発行」を、CEOが手順を覚えたまま手作業で進めていた。
 * ここでは、その一連の流れを「今どこまで終わっているか」として一箇所にまとめ、
 * 抜け漏れなく型どおりに導入できるようにする。
 */
import { isEmailConfigured } from "./email";
import { resolveCustomerLoginMethods } from "./email-login";
import { resolveLiffId } from "./line";
import { prisma } from "./prisma";

export type OnboardingStep = {
  key: string;
  label: string;
  description: string;
  done: boolean;
  /** 完了状態の補足（「共通の既定値を使用中」など） */
  note?: string;
  href: string;
  linkLabel: string;
};

export type OnboardingStatus = {
  steps: OnboardingStep[];
  doneCount: number;
  totalCount: number;
  allDone: boolean;
  bookingUrlPath: string;
};

export async function buildOnboardingStatus(tenantId: string): Promise<OnboardingStatus> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("部署が見つかりません");

  const [staffCount, menuCount, businessHourCount, ownerAccountCount] = await Promise.all([
    prisma.staff.count({ where: { tenantId, isActive: true } }),
    prisma.menu.count({ where: { tenantId, isActive: true } }),
    prisma.businessHour.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, role: "owner" } }),
  ]);

  const methods = resolveCustomerLoginMethods(tenant);
  // methods.line は resolveCustomerLoginMethods の中ですでに「実際にLINE設定が
  // あるか」まで見ている。メールは、選ばれていても RESEND_API_KEY が無ければ
  // お客様にコードが届かないので、ここで確かめる
  const lineUsable = methods.line;
  const emailUsable = methods.email && isEmailConfigured();
  const customerLoginReady = lineUsable || emailUsable;
  const customerLoginMethodLabel =
    lineUsable && emailUsable ? "LINE・メール" : lineUsable ? "LINE" : emailUsable ? "メール" : "未設定";

  const lineMessagingReady = Boolean(
    tenant.lineMessagingAccessToken || process.env.LINE_MESSAGING_ACCESS_TOKEN,
  );
  const lineMessagingIsTenantSpecific = Boolean(tenant.lineMessagingAccessToken);

  const steps: OnboardingStep[] = [
    {
      key: "basicInfo",
      label: "部署の基本設定",
      description: "店舗名と、お客様向けURLの短い名前（例：/book/sample-salon）を決める。",
      done: Boolean(tenant.slug),
      note: tenant.slug ? undefined : "短い名前は未設定（店舗IDのURLのままでも運用できます）",
      href: "/settings/store",
      linkLabel: "店舗設定へ",
    },
    {
      key: "customerLogin",
      label: "お客様のログイン方法",
      description: "LINE・メールのどちらか（または両方）で、お客様が本人確認できるようにする。",
      done: customerLoginReady,
      note: customerLoginReady ? `${customerLoginMethodLabel}で受付中` : undefined,
      href: "/settings/store",
      linkLabel: "店舗設定へ",
    },
    {
      key: "lineMessaging",
      label: "LINE公式アカウントの通知",
      description: "予約確定・前日リマインドなどをLINEで送れるようにする。",
      done: lineMessagingReady,
      note: lineMessagingReady
        ? lineMessagingIsTenantSpecific
          ? "この部署専用の設定を使用中"
          : "システム共通の設定を使用中"
        : undefined,
      href: "/settings/store",
      linkLabel: "店舗設定へ",
    },
    {
      key: "liff",
      label: "LIFF連携（任意）",
      description:
        "LINEアプリの中で予約ページが自動ログインで開けるようにする。LINEログインチャネルの「LIFF」タブから作成する（新しいチャネルは不要）。",
      done: Boolean(resolveLiffId(tenant)),
      note: resolveLiffId(tenant) ? "設定済み" : "未設定でも、通常のLINE/メールログインは使えます",
      href: "/settings/store",
      linkLabel: "店舗設定へ",
    },
    {
      key: "staff",
      label: "スタッフの登録",
      description: "予約を受け付ける担当者を、最低1人登録する。",
      done: staffCount > 0,
      note: `在籍中 ${staffCount}人`,
      href: "/settings/staff",
      linkLabel: "スタッフ設定へ",
    },
    {
      key: "menu",
      label: "メニューの登録",
      description: "お客様が選ぶメニュー（施術・面談など）を、最低1つ登録する。",
      done: menuCount > 0,
      note: `受付中 ${menuCount}件`,
      href: "/settings/menus",
      linkLabel: "メニュー設定へ",
    },
    {
      key: "businessHours",
      label: "営業時間の設定",
      description: "曜日ごとの基本の営業時間を決める。未設定だと空き枠が出ない。",
      done: businessHourCount > 0,
      href: "/settings/hours",
      linkLabel: "営業時間設定へ",
    },
    {
      key: "ownerAccount",
      label: "オーナー用ログインアカウント",
      description: "クライアント企業の担当者が、自分でログインして運用できるようにする。",
      done: ownerAccountCount > 0,
      note: `オーナー権限 ${ownerAccountCount}件`,
      href: "/settings/accounts",
      linkLabel: "アカウント設定へ",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return {
    steps,
    doneCount,
    totalCount: steps.length,
    allDone: doneCount === steps.length,
    bookingUrlPath: `/book/${tenant.slug ?? tenant.id}`,
  };
}
