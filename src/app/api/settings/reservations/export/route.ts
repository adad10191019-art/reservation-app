/**
 * 予約データのCSVエクスポート。オーナー（または全社管理者）が、
 * 自社の顧客管理・経理に使えるよう指定期間の予約を書き出す。
 */
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { buildReservationsCsv } from "@/lib/analytics";
import { sanitizeDate } from "@/lib/time";

export async function GET(request: Request) {
  const session = await requireOwner();
  const url = new URL(request.url);

  const from = sanitizeDate(url.searchParams.get("from") ?? undefined);
  const to = sanitizeDate(url.searchParams.get("to") ?? undefined);
  const [rangeFrom, rangeTo] = from <= to ? [from, to] : [to, from];

  const csv = await buildReservationsCsv(session.tenantId, rangeFrom, rangeTo);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reservations_${rangeFrom}_${rangeTo}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
