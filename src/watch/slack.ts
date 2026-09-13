/**
 * Slack Incoming Webhook への通知投稿。
 *
 * 二段階同意の第一段階(CLAUDE.md「不安を煽らない」の延長)：ここでは金額を一切含めない。
 * AIは使わない(固定テンプレート文言のみで、生成の必要がないため)。
 */
export interface SlackNoticeOptions {
  webhookUrl: string;
  /** きっかけの文言(数字なし) */
  message: string;
  /** クリック後にたどり着くマジックリンク */
  noticeUrl: string;
  /** テスト用に差し替える(既定はグローバルの fetch) */
  fetchImpl?: typeof fetch;
}

export async function postNoticeToSlack(o: SlackNoticeOptions): Promise<void> {
  const doFetch = o.fetchImpl ?? fetch;
  const res = await doFetch(o.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `${o.message}\n${o.noticeUrl}` }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Slack通知に失敗しました: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
}
