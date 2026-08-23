/**
 * POST /api/diagnose ─ 算定エンジンの HTTP 境界（T-02）
 *
 * 責務は「検証して算定して返す」だけ。金額は src/calc でしか作らない（責務境界）。
 * loadParams が YAML を readFileSync で読むため Node ランタイムで動かす（Edge 不可）。
 */
import { NextResponse } from "next/server";
import { diagnose } from "../../../src/calc/index.js";
import { loadParams } from "../../../src/params/index.js";
import { DiagnoseRequestSchema } from "./schema.js";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "リクエストボディを JSON として解釈できません。" },
      { status: 400 },
    );
  }

  const parsed = DiagnoseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const params = loadParams();
    const result = diagnose(params, parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    // 期限切れ・未確認パラメータでは診断を止める設計（PR-04）。
    // 古い値で黙って出すより、止めて 503 を返すほうが安全。
    const message = e instanceof Error ? e.message : "診断を実行できませんでした。";
    return NextResponse.json({ error: "diagnosis_unavailable", message }, { status: 503 });
  }
}
