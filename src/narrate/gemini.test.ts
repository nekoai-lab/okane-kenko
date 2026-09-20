/**
 * Gemini クライアントのテスト（T-07）。**実APIは叩かない**（fetch を差し替える）。
 * ここで確かめるのは「切れ目をまたいでも本文を取りこぼさない」「失敗は例外で返る」こと。
 */
import { describe, expect, it, vi } from "vitest";
import { checkApiKey, consumeSse, streamGeminiText } from "./gemini.js";

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

  it("最後のブロックに終端の空行が無くても取りこぼさない", async () => {
    // 実際にこれで本文がまるごと消えた（2026-08-30）。読み込み中は「途中かもしれない」
    // ブロックを保留するので、ストリームの終わりで吐き出さないと最後の1本が落ちる。
    const noTrailingBlankLine = sse("最後の1文。").trimEnd();
    const g = streamGeminiText({ ...OPTS, fetchImpl: fakeFetch([noTrailingBlankLine]) });
    expect(await collect(g)).toBe("最後の1文。");
  });

  it("本文が1文字も来なければ理由を付けて投げる（黙って空を返さない）", async () => {
    const onlyFinish = `data: ${JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] })}\n\n`;
    await expect(
      collect(streamGeminiText({ ...OPTS, fetchImpl: fakeFetch([onlyFinish]) })),
    ).rejects.toThrow("MAX_TOKENS");
  });

  it("HTTP エラーは例外にする（呼び出し側が退避文に切り替えられる）", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("API key not valid", { status: 400 }),
    ) as unknown as typeof fetch;
    await expect(collect(streamGeminiText({ ...OPTS, fetchImpl }))).rejects.toThrow("HTTP 400");
  });
});

describe("checkApiKey（値そのものは扱わない）", () => {
  const OK = "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

  it("よくある貼り付け事故を、呼び出す前に言う", () => {
    expect(checkApiKey(`"${OK}"`).problem).toContain("引用符");
    expect(checkApiKey(`<${OK}>`).problem).toContain("山カッコ");
    expect(checkApiKey("AIzaShort").problem).toContain("短すぎる");
    expect(checkApiKey(OK).problem).toBeNull();
    expect(checkApiKey(OK).note).toBeNull();
  });

  /**
   * 2026-09-20：AI Studio が発行した有効な鍵（Google に直接投げて 200）が
   * `AIza` で始まらず、こちらの検査だけで拒否して半日止まった。
   * 鍵の形式は Google の都合で増える。**知っている形を正解にしない。**
   */
  it("見慣れない形式でも止めない（妥当性の判断は Google に任せる）", () => {
    const NEW_FORMAT = "AQ.Ab8RN6JabcdefghijklmnopqrstuvwxyZ0123456789";
    expect(checkApiKey(NEW_FORMAT).problem).toBeNull();
    expect(checkApiKey(NEW_FORMAT).note).toContain("新しい形式");
  });

  it("目に見えない文字（ゼロ幅・BOM・改行なし空白）は落として使い、落としたことを伝える", () => {
    // ブラウザからのコピーで前後に付く。**`\s` に一致しない**ので、以前はこれを
    // 「AIza で始まっていない」と誤って報告していた（2026-08-30 に実際に踏んだ）
    for (const invisible of ["​", "﻿", " ", "⁠"]) {
      const check = checkApiKey(`${invisible}${OK}${invisible}`);
      expect(check.problem).toBeNull();
      expect(check.key).toBe(OK);
      expect(check.note).toContain("目に見えない文字");
    }
  });

  it("普通の空白・改行も同じように落とす", () => {
    expect(checkApiKey(` ${OK}\n`).key).toBe(OK);
  });
});
