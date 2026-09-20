/**
 * POST /api/watch/consent ─ 診断結果を保存し、気づき通知を受け取る同意を記録する(T-13)
 *
 * 責務は「/result と同じ入力から再診断し、世帯のスナップショットを保存する」だけ。
 * 金額の生成はしない(diagnose の結果をそのまま使う)。同意なしに黙って保存しない
 * (この呼び出し自体が、独立した確認画面での明示的な選択から来る)。
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { diagnose } from "../../../../src/calc/index.js";
import { loadParams } from "../../../../src/params/index.js";
import { toCompleteSelections } from "../../../../src/wizard/complete.js";
import { normalize } from "../../../../src/wizard/normalize.js";
import { decodeSelections } from "../../../../src/wizard/url.js";
import { createFirestoreWatchStore } from "../../../../src/watch/store.firestore.js";
import { ConsentRequestSchema } from "./schema.js";

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

  const parsed = ConsentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const partial = decodeSelections(parsed.data.query);
  const complete = toCompleteSelections(partial);
  if (!complete) {
    return NextResponse.json(
      { error: "incomplete_selections", message: "入力がまだ足りていないようです。" },
      { status: 400 },
    );
  }

  try {
    const params = loadParams();
    const asOf = new Date();
    const { input } = normalize(params, complete, asOf);
    const diagnosis = diagnose(params, input, asOf);

    const token = randomUUID();
    const consentedAt = asOf.toISOString();
    const store = createFirestoreWatchStore();
    await store.createHousehold({
      token,
      wizardSelections: complete,
      lastDiagnosis: {
        headlineKind: diagnosis.householdHeadline.kind,
        paramVersion: diagnosis.paramVersion,
        diagnosedAt: consentedAt,
      },
      consentedAt,
    });

    return NextResponse.json({ token });
  } catch (e) {
    const message = e instanceof Error ? e.message : "保存できませんでした。";
    return NextResponse.json({ error: "consent_failed", message }, { status: 503 });
  }
}
