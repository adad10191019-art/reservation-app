import Link from "next/link";

const OPERATOR_NAME = "株式会社youth personnel";
const CONTACT_EMAIL = "info@youth-personnel.com";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">プライバシーポリシー</h1>
      </header>

      <div className="space-y-5 rounded-lg border border-neutral-200 bg-white p-5 text-sm leading-relaxed text-neutral-700">
        <section>
          <p>
            {OPERATOR_NAME}（以下「当社」といいます）は、予約サービス（以下「本サービス」といいます）における
            利用者の個人情報を、以下の方針に基づき取り扱います。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">1. 取得する情報</h2>
          <p>本サービスでは、予約のために以下の情報を取得することがあります。</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>お名前</li>
            <li>LINEアカウントの識別情報（LINEログインをご利用の場合）</li>
            <li>予約内容（日時、メニュー、担当者等）</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">2. 利用目的</h2>
          <p>取得した情報は、以下の目的のために利用します。</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>予約の受付・管理・ご連絡のため</li>
            <li>予約内容に関する通知（LINE・メール等）の送信のため</li>
            <li>本サービスの運営・改善のため</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">3. 第三者提供</h2>
          <p>
            当社は、法令に基づく場合を除き、本人の同意なく取得した情報を第三者に提供することはありません。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">4. 委託先</h2>
          <p>
            当社は、本サービスの提供にあたり、以下のような外部サービスを利用することがあります。これらの事業者は、
            それぞれの定めるプライバシーポリシーに基づき情報を取り扱います。
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>LINE Corporation（LINEログイン・メッセージ配信）</li>
            <li>メール配信サービス（予約通知メールの送信）</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">5. 安全管理</h2>
          <p>
            当社は、取得した情報の漏えい、滅失またはき損の防止その他の安全管理のために必要かつ適切な措置を講じます。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">6. 開示・訂正・削除</h2>
          <p>
            利用者は、当社が保有する自己の個人情報について、開示・訂正・削除を求めることができます。ご希望の場合は
            下記のお問い合わせ先までご連絡ください。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">7. 本ポリシーの変更</h2>
          <p>
            当社は、必要に応じて本ポリシーの内容を変更することがあります。変更後の内容は、本ページに掲載した時点
            から効力を生じるものとします。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">お問い合わせ</h2>
          <p>個人情報の取り扱いに関するお問い合わせは、下記までご連絡ください。</p>
          <p className="mt-1">
            {OPERATOR_NAME}
            <br />
            愛知県名古屋市中区栄2丁目9−5 アーク栄東海ビル4階
            <br />
            代表者：山内駿也
            <br />
            {CONTACT_EMAIL}
          </p>
        </section>
      </div>

      <p className="mt-4">
        <Link href="/legal/terms" className="text-sm text-sky-700 hover:underline">
          利用規約はこちら
        </Link>
      </p>
    </main>
  );
}
