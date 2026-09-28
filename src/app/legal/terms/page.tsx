import Link from "next/link";

const OPERATOR_NAME = "株式会社youth personnel";
const CONTACT_EMAIL = "info@youth-personnel.com";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">利用規約</h1>
      </header>

      <div className="space-y-5 rounded-lg border border-neutral-200 bg-white p-5 text-sm leading-relaxed text-neutral-700">
        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">第1条（本規約について）</h2>
          <p>
            本規約は、{OPERATOR_NAME}（以下「当社」といいます）が提供する予約サービス（以下「本サービス」といいます）の
            利用条件を定めるものです。本サービスをご利用になるお客様（以下「利用者」といいます）は、本規約に同意のうえ
            ご利用いただきます。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">第2条（予約）</h2>
          <p>
            利用者は、本サービスを通じて来店・面談等の予約を行うことができます。予約内容に誤りがあった場合や、
            やむを得ない事情によりご予約をお受けできない場合、当社より別途ご連絡することがあります。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">第3条（予約の変更・キャンセル）</h2>
          <p>
            予約の変更・キャンセルは、各サービスの案内に従ってお手続きください。無断キャンセルやご連絡のない
            不参加が続いた場合、以後のご予約をお断りすることがあります。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">第4条（禁止事項）</h2>
          <p>利用者は、本サービスの利用にあたり、以下の行為をしてはならないものとします。</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>虚偽の情報を登録する行為</li>
            <li>他人になりすまして本サービスを利用する行為</li>
            <li>本サービスの運営を妨げる行為</li>
            <li>法令または公序良俗に反する行為</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">第5条（免責事項）</h2>
          <p>
            当社は、本サービスの内容を予告なく変更、中断、終了することがあります。これにより利用者に生じた損害に
            ついて、当社は故意または重過失による場合を除き、責任を負わないものとします。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">第6条（規約の変更）</h2>
          <p>
            当社は、必要と判断した場合、利用者への事前の通知なく本規約を変更することがあります。変更後の規約は、
            本ページに掲載した時点から効力を生じるものとします。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-neutral-900">お問い合わせ</h2>
          <p>本規約に関するお問い合わせは、下記までご連絡ください。</p>
          <p className="mt-1">{CONTACT_EMAIL}</p>
        </section>
      </div>

      <p className="mt-4">
        <Link href="/legal/privacy" className="text-sm text-sky-700 hover:underline">
          プライバシーポリシーはこちら
        </Link>
      </p>
    </main>
  );
}
