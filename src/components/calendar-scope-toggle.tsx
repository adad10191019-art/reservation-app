import Link from "next/link";

/** 予約カレンダーの「自分だけ／全員」の切り替え。開いたときは自分だけ（lib/calendar-scope.ts） */
export function CalendarScopeToggle({
  showingMineOnly,
  mineHref,
  allHref,
}: {
  showingMineOnly: boolean;
  mineHref: string;
  allHref: string;
}) {
  const base = "px-3 py-1.5 text-sm transition-colors";
  const active = "bg-sky-50 font-medium text-sky-800";
  const idle = "bg-white text-neutral-700 hover:bg-neutral-50";
  return (
    <div
      className="mb-3 inline-flex overflow-hidden rounded-md border border-neutral-300"
      role="group"
      aria-label="表示する人"
    >
      <Link
        href={mineHref}
        aria-current={showingMineOnly ? "true" : undefined}
        className={`${base} ${showingMineOnly ? active : idle}`}
      >
        自分だけ
      </Link>
      <Link
        href={allHref}
        aria-current={showingMineOnly ? undefined : "true"}
        className={`${base} border-l border-neutral-300 ${showingMineOnly ? idle : active}`}
      >
        全員を見る
      </Link>
    </div>
  );
}
