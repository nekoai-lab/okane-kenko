import { describe, expect, it, vi } from "vitest";
import { postNoticeToSlack } from "./slack.js";

describe("postNoticeToSlack", () => {
  it("Webhook URL へ text 付きの JSON を POST する", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    await postNoticeToSlack({
      webhookUrl: "https://hooks.slack.test/abc",
      message: "お子さんが6歳になりました。",
      noticeUrl: "https://example.test/notice/tok-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.slack.test/abc");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe("お子さんが6歳になりました。\nhttps://example.test/notice/tok-1");
  });

  it("HTTPエラーなら例外を投げる", async () => {
    const fetchImpl = vi.fn(async () => new Response("invalid_payload", { status: 400 }));
    await expect(
      postNoticeToSlack({
        webhookUrl: "https://hooks.slack.test/abc",
        message: "テスト",
        noticeUrl: "https://example.test/notice/tok-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Slack通知に失敗しました/);
  });
});
