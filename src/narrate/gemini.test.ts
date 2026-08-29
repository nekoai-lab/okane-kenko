/**
 * Gemini クライアントのテスト（T-07）。**実APIは叩かない**（fetch を差し替える）。
 * ここで確かめるのは「切れ目をまたいでも本文を取りこぼさない」「失敗は例外で返る」こと。
 */
import { describe, expect, it, vi } from "vitest";
import { apiKeyProblem, consumeSse, streamGeminiText } from "./gemini.js";

function sse(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
}

/** チャンク境界を任意の位置で切って流す（実際のネットワークはブロックの途中で切れる） */
function fakeFetch(chunks: string[]): typeof fetch {
  return vi.fn(async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(encoder.encode(ch));
        c.close();
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
}

async function collect(g: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const t of g) out += t;
  return out;
}

const OPTS = { apiKey: "AIza-test", model: "gemini-2.5-flash", system: "s", user: "u" };

describe("consumeSse", () => {
  it("完結したブロックだけを取り出し、未完のブロックは残す", () => {
    const r = consumeSse(`${sse("あ")}data: {"candi`);
    expect(r.texts).toEqual(["あ"]);
    expect(r.rest).toBe('data: {"candi');
  });

  it("壊れたブロックは捨てて、続きを止めない", () => {
    const r = consumeSse(`data: {壊れ}\n\n${sse("い")}`);
    expect(r.texts).toEqual(["い"]);
  });
});

describe("streamGeminiText", () => {
  it("ブロックの途中で切れても本文をつなげて返す", async () => {
    const whole = sse("いまの前提では、") + sse("{{conclusion}}。");
    const cut = Math.floor(whole.length / 3);
    const g = streamGeminiText({
      ...OPTS,
      fetchImpl: fakeFetch([whole.slice(0, cut), whole.slice(cut)]),
    });
    expect(await collect(g)).toBe("いまの前提では、{{conclusion}}。");
  });

  it("HTTP エラーは例外にする（呼び出し側が退避文に切り替えられる）", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("API key not valid", { status: 400 }),
    ) as unknown as typeof fetch;
    await expect(collect(streamGeminiText({ ...OPTS, fetchImpl }))).rejects.toThrow("HTTP 400");
  });
});

describe("apiKeyProblem（値そのものは扱わない）", () => {
  it("よくある貼り付け事故を、呼び出す前に言う", () => {
    expect(apiKeyProblem('"AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345"')).toContain("引用符");
    expect(apiKeyProblem("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012 345")).toContain("空白");
    expect(apiKeyProblem("sk-ant-0123456789012345678901234567890")).toContain("AIza");
    expect(apiKeyProblem("AIzaShort")).toContain("短すぎる");
    expect(apiKeyProblem("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345")).toBeNull();
  });
});
