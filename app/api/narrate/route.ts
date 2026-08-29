/**
 * GET /api/narrate ─ AI言語化のストリーミング境界（T-07）
 *
 * 流すのは**プレースホルダだけのテンプレ**で、金額は一度もここを通らない。
 * 数値の差し込みはクライアント側が、サーバの算定結果から作った値マップだけを使って行う
 * （`app/result/Narration.tsx`）。だから途中まで届いた文でも数値検査（G-1）が成り立つ。
 *
 * 入力は結果画面と同じ URL の区分コードだけを受け取り、**算定はここでやり直す**。
 * クライアントから渡された金額を信用しない（金額を作るのは src/calc だけ）。
 *
 * 検査そのものは `src/narrate/narrateStream.ts`（テストできる形にしてある）。
 * ここが持つのは HTTP と鍵とタイムアウトだけ。
 */
import { diagnose } from "../../../src/calc/index.js";
import { apiKeyProblem, narrationModel, streamGeminiText } from "../../../src/narrate/gemini.js";
import {
  fallbackEvent,
  type NarrationEvent,
  narrateStreamEvents,
} from "../../../src/narrate/narrateStream.js";
import { buildUserContent, systemPrompt } from "../../../src/narrate/prompt.js";
import { loadParams } from "../../../src/params/index.js";
import { toCompleteSelections } from "../../../src/wizard/complete.js";
import { normalize } from "../../../src/wizard/normalize.js";
import { decodeSelections } from "../../../src/wizard/url.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 生成が止まったまま画面を待たせない上限。超えたら退避文に切り替える */
const TIMEOUT_MS = 20_000;

const encoder = new TextEncoder();
function line(e: NarrationEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(e)}\n`);
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const complete = toCompleteSelections(decodeSelections(q));
  if (!complete) {
    return Response.json({ error: "incomplete_input" }, { status: 400 });
  }

  let diagnosis: ReturnType<typeof diagnose>;
  try {
    const params = loadParams();
    const { input } = normalize(params, complete, new Date());
    diagnosis = diagnose(params, input);
  } catch (e) {
    // 期限切れ・未確認パラメータでは診断を止める設計（PR-04）。言語化も当然止める。
    const message = e instanceof Error ? e.message : "診断を実行できませんでした。";
    return Response.json({ error: "diagnosis_unavailable", message }, { status: 503 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const keyProblem = apiKey ? apiKeyProblem(apiKey) : "未設定";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!apiKey || keyProblem) {
        // 鍵の値は出さない。形の問題だけをサーバログに残す（黙ると原因が見えないまま
        // 退避文が出続ける＝この製品がいちばん避けたい「静かな壊れ方」になる）
        console.warn(`[narrate] GEMINI_API_KEY: ${keyProblem}。退避文で返します。`);
        controller.enqueue(
          line(fallbackEvent(diagnosis, "ai_unavailable", keyProblem ?? undefined)),
        );
        controller.close();
        return;
      }

      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
      try {
        const deltas = streamGeminiText({
          apiKey,
          model: narrationModel(),
          system: systemPrompt("text"),
          user: buildUserContent(diagnosis),
          signal: abort.signal,
        });
        for await (const e of narrateStreamEvents(diagnosis, deltas)) {
          if (e.type === "fallback") {
            console.warn(`[narrate] 退避（${e.reason}）${e.detail ?? ""}`);
            abort.abort(); // 検査に落ちた時点で生成を打ち切る（続きは要らない）
          }
          controller.enqueue(line(e));
        }
      } catch (e) {
        // タイムアウト・ネットワーク・APIエラー。受け取ったのは文章だけなので捨てれば済む
        const reason = abort.signal.aborted ? "timeout" : "api_error";
        const detail = e instanceof Error ? e.message : String(e);
        console.warn(`[narrate] ${reason}: ${detail}`);
        controller.enqueue(line(fallbackEvent(diagnosis, reason, detail)));
      } finally {
        clearTimeout(timer);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
