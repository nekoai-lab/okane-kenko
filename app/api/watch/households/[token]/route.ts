/**
 * DELETE /api/watch/households/:token ─ 世帯の保存記録を即時物理削除する(SPEC.md US-10)
 */
import { NextResponse } from "next/server";
import { createFirestoreWatchStore } from "../../../../../src/watch/store.firestore.js";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const store = createFirestoreWatchStore();
  const household = await store.findByToken(token);
  if (!household) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await store.deleteHousehold(household.id);
  return NextResponse.json({ deleted: true });
}
