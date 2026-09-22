import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireSession } from "@/lib/auth";
import { getTenant } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { formatDateLabel } from "@/lib/time";

/** 一覧に出す最大件数。超えたら絞り込みを促す */
const LIST_LIMIT = 200;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const session = await requireSession();
  const tenant = await getTenant(session.tenantId);

  const customers = await prisma.customer.findMany({
    where: {
      tenantId: session.tenantId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      // 件数はここでJS側で数える。「done」と「booked」で別々に絞り込んだ
      // _count を1つの relation に対して同時には持てないため
      reservations: {
        where: { status: { in: ["done", "booked"] } },
        select: { status: true, date: true },
      },
    },
    orderBy: { name: "asc" },
    take: LIST_LIMIT,
  });

  const rows = customers.map((c) => {
    const done = c.reservations.filter((r) => r.status === "done");
    const booked = c.reservations.filter((r) => r.status === "booked");
    const lastVisit = done.map((r) => r.date).sort().at(-1) ?? null;
    return { ...c, visitCount: done.length, upcomingCount: booked.length, lastVisit };
  });

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <AppHeader tenantName={tenant.name} subtitle="顧客一覧" session={session}>
        <Link
          href="/calendar"
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          カレンダーへ
        </Link>
      </AppHeader>

      <form className="mb-4 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="名前・電話番号・メールアドレスで検索"
          className="w-full max-w-sm rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          検索
        </button>
        {q && (
          <Link
            href="/customers"
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            クリア
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          {q ? "該当するお客様がいません。" : "まだお客様が登録されていません。"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-600">
                <th className="px-4 py-2 font-medium">お名前</th>
                <th className="px-4 py-2 font-medium">連絡先</th>
                <th className="px-4 py-2 font-medium">来店回数</th>
                <th className="px-4 py-2 font-medium">最終来店日</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-neutral-100 last:border-b-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.lineUserId && !c.lineUserId.startsWith("dev:") && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        LINE連携
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {c.phone || c.email || <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-neutral-600">
                    {c.visitCount}回
                    {c.upcomingCount > 0 && (
                      <span className="ml-1.5 text-xs text-sky-600">
                        （予約中 {c.upcomingCount}件）
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-neutral-600">
                    {c.lastVisit ? formatDateLabel(c.lastVisit) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === LIST_LIMIT && (
        <p className="mt-3 text-xs text-neutral-500">
          {LIST_LIMIT}件まで表示しています。絞り込むには検索してください。
        </p>
      )}
    </main>
  );
}
