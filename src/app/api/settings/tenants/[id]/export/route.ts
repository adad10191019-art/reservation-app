/**
 * 部署（テナント）の全データをJSONで書き出す。解約前の保全や、
 * クライアント企業への引き渡しに使う。全社管理者だけが行える。
 */
import { NextResponse } from "next/server";
import { requireGroupAdmin } from "@/lib/auth";
import { buildTenantExport } from "@/lib/tenant-offboarding";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireGroupAdmin();
  const { id } = await params;

  const data = await buildTenantExport(id);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const filename = `${data.tenant.slug ?? data.tenant.id}-export-${data.exportedAt.slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
