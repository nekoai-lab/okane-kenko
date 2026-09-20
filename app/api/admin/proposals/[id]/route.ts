/**
 * POST /api/admin/proposals/{id} ─ 提案に「人が見た」という記録を付ける。
 *
 * **ここでも params/ は1バイトも変わらない。** 承認は記録であって、適用ではない。
 * YAML の更新は人間が PR で行う（取り消せない操作をエージェントにも画面にも渡さない）。
 */
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, checkToken } from "../../../../../src/paramwatch/auth.js";
import { createFirestoreProposalStore } from "../../../../../src/paramwatch/store.firestore.js";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);

  if (!checkToken(cookie, process.env.ADMIN_PASSWORD)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const form = await req.formData();
  const decision = String(form.get("decision") ?? "");
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const store = createFirestoreProposalStore();
  const target = (await store.listProposals()).find((p) => p.id === id);
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // **不変条件に落ちた提案は承認できない。**画面のボタンを消すだけでなく、ここでも拒む
  if (decision === "approved" && !target.impact.safe) {
    return NextResponse.json({ error: "unsafe_proposal" }, { status: 409 });
  }

  await store.decide(id, decision, new Date().toISOString());
  // 絶対URLを組み立てない（Cloud Run では内部の 0.0.0.0:8080 になる。login ルート参照）
  return new NextResponse(null, { status: 303, headers: { Location: "/admin/proposals" } });
}
