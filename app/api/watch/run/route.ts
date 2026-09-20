/**
 * POST /api/watch/run ─ 気づき通知の定期実行(Cloud Schedulerから叩く)
 *
 * 認証は共有シークレット(X-Watch-Secretヘッダ)。Cloud RunのIAM invokerはサービス全体に
 * かかるため、同一アプリ内の1ルートだけを守るにはこの方式が最も簡単(OIDC検証より軽い)。
 * 破壊的な操作はしない(Slack投稿のみ)ため、この強度で十分と判断した。
 */
import { NextResponse } from "next/server";
import { loadParams } from "../../../../src/params/index.js";
import { runWatch } from "../../../../src/watch/run.js";
import { createFirestoreWatchStore } from "../../../../src/watch/store.firestore.js";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-watch-secret");
  const expected = process.env.WATCH_CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const baseUrl = process.env.WATCH_BASE_URL;
  if (!webhookUrl || !baseUrl) {
    return NextResponse.json(
      {
        error: "misconfigured",
        message: "SLACK_WEBHOOK_URL または WATCH_BASE_URL が未設定です。",
      },
      { status: 500 },
    );
  }

  try {
    const params = loadParams();
    const result = await runWatch({
      store: createFirestoreWatchStore(),
      params,
      now: new Date(),
      webhookUrl,
      baseUrl,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "実行できませんでした。";
    return NextResponse.json({ error: "watch_run_failed", message }, { status: 500 });
  }
}
