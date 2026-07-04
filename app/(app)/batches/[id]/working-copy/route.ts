import { NextResponse } from "next/server";
import { batchApi } from "@/lib/batches";
import { resolveBatchActor } from "../../actions";

// Working-copy download (US-D1 AC 8). Tenant + lab visibility are enforced in
// batchApi.workingCopyFile via the live-validated actor (invariant 4/5).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveBatchActor();
  const file = await batchApi.workingCopyFile(actor, id);
  if (!file) return new NextResponse("Working copy not available.", { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
    },
  });
}
