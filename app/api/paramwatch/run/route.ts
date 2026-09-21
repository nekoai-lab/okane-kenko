/**
 * POST /api/paramwatch/run ─ 制度側の自律監視の1周（フェーズ2b）。
 *
 * 認証は T-13 と同じ共有シークレット（`X-Watch-Secret`）。
 * **このルートは params/ を書き換えない。**できるのは承認キューに積むことだけ。
 */
import { NextResponse } from "next/server";
import { GOLDEN } from "../../../../src/__tests__/households.js";
import { loadParams, loadParamsText } from "../../../../src/params/index.js";
import { runParamWatch } from "../../../../src/paramwatch/run.js";
import { loadWatchSources } from "../../../../src/paramwatch/sources.js";
import { createFirestoreProposalStore } from "../../../../src/paramwatch/store.firestore.js";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-watch-secret");
  const expected = process.env.WATCH_CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runParamWatch({
      params: loadParams(),
      // デモ用の watch（罠ページ）は ?demo=1 を明示したときだけ。定期実行には入れない
      sources: loadWatchSources({ includeDemo: new URL(req.url).searchParams.get("demo") === "1" }),
      // 影響を測る世帯は、算定の正本と同じ10世帯を使う（別の corpus を作らない）
      // 期待値は「現行 params で green か」を確かめるためだけに渡す（候補値とは比べない）
      cases: GOLDEN.map((g) => ({ id: g.id, label: g.label, input: g.input, expect: g.expect })),
      store: createFirestoreProposalStore(),
      paramsYaml: loadParamsText(),
      now: () => new Date(),
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "実行できませんでした。";
    return NextResponse.json({ error: "param_watch_failed", message }, { status: 500 });
  }
}
