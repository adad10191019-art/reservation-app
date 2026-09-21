import Link from "next/link";
import { Banner } from "@/components/banner";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatRanges } from "@/lib/ranges";
import { saveBusinessHours } from "@/lib/settings-actions";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default async function HoursSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string; error?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOwner();

  const staffs = await prisma.staff.findMany({
    where: { tenantId: session.tenantId, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  const target = staffs.some((s) => s.id === sp.target) ? sp.target! : "shop";
  const staffId = target === "shop" ? null : target;

  const hours = await prisma.businessHour.findMany({
    where: { tenantId: session.tenantId, staffId },
  });

  // 曜日ごとに "10:00-13:00, 14:00-19:00" の形へ
  const byDay = WEEKDAYS.map((_, dayOfWeek) =>
    formatRanges(
      hours
        .filter((h) => h.dayOfWeek === dayOfWeek)
        .map((h) => ({ start: h.startMinutes, end: h.endMinutes })),
    ),
  );

  const targetName =
    staffId === null ? "店舗全体" : (staffs.find((s) => s.id === staffId)?.name ?? "");

  return (
    <div className="space-y-5">
      <Banner error={sp.error} done={sp.done} />

      <nav className="flex flex-wrap gap-2">
        <TargetLink href="/settings/hours?target=shop" active={target === "shop"}>
          店舗全体
        </TargetLink>
        {staffs.map((staff) => (
          <TargetLink
            key={staff.id}
            href={`/settings/hours?target=${staff.id}`}
            active={target === staff.id}
          >
            {staff.name}
          </TargetLink>
        ))}
      </nav>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">{targetName}の営業時間</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          <code>10:00-13:00, 14:00-19:00</code> のように入力します。
          間を空けると、その時間は勤務外（昼休憩など）になります。
          <br />
          空欄にすればその曜日は休みです。
          {staffId === null ? (
            <>
              <br />
              店舗全体の設定は、<strong>個別の設定がないスタッフ</strong>に使われます。
            </>
          ) : (
            <>
              <br />
              個別に設定すると、<strong>店舗全体より優先</strong>されます。
              すべて空欄にすると、店舗全体の設定に戻ります。
            </>
          )}
        </p>

        <form action={saveBusinessHours} className="space-y-3">
          <input type="hidden" name="target" value={target} />

          {WEEKDAYS.map((label, dayOfWeek) => (
            <label key={label} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-sm font-medium">{label}</span>
              <input
                type="text"
                name={`day${dayOfWeek}`}
                defaultValue={byDay[dayOfWeek]}
                placeholder="休み"
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-sm"
              />
            </label>
          ))}

          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            保存する
          </button>
        </form>
      </section>

      <p className="text-xs leading-relaxed text-neutral-500">
        ここで設定するのは<strong>曜日ごとの基本パターン</strong>です。
        「この日だけ休み」「この日だけ短縮」といった例外は、日付ごとの設定で扱います
        （画面は今後追加します）。
      </p>
    </div>
  );
}

function TargetLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-1.5 text-sm ${
        active
          ? "border-sky-300 bg-sky-50 text-sky-800"
          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {children}
    </Link>
  );
}
