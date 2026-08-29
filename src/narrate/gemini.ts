/**
 * Gemini API クライアント（T-07 本実装）─ **文章を1本もらうだけ**。
 *
 * 責務境界（CLAUDE.md）：ここは AI に「言い換え」をさせるだけで、数値は作らない。
 * 返ってくるのはプレースホルダだけのテンプレで、差し込みは呼び出し側がやる。
 * AI に副作用を持たせない（DB・外部送信・削除の手段を渡さない）ので、検査に落ちたら破棄で済む。
 *
 * エンドポイントは AI Studio（`generativelanguage.googleapis.com`）。Vertex AI ではない。
 * 鍵はヘッダ `x-goog-api-key` で渡す（クエリ文字列はアクセスログやプロキシに残るため）。
 */

/**
 * 使うモデル。**ADR-017 が未記入の間の暫定値**で、確定はベイクオフの盲検採点後
 * （`docs/レポート品質_評価基準.md` §7）。差し替えは `.env.local` の GEMINI_MODEL で効く。
 */
const DEFAULT_MODEL = "gemini-2.5-flash";

export function narrationModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * 鍵の「形」だけを検査する。**値そのものは決して返さない・出さない。**
 *
 * Google は取り違えの理由を返さず `400 API key not valid` としか言わないので、
 * 引用符や空白の混入のような、よくある貼り付け事故をここで先に言う。
 * 形がおかしいまま動かすと、フォールバックが出続けるだけで原因が見えない（静かな壊れ方）。
 */
export function apiKeyProblem(key: string): string | null {
  if (/^["']|["']$/.test(key)) return "引用符が含まれている（.env.local に引用符は不要）";
  if (/\s/.test(key)) return "空白または改行が混ざっている";
  if (!key.startsWith("AIza")) return "AIza で始まっていない（AI Studio のキーではない可能性）";
  if (key.length < 30) return `短すぎる（${key.length}文字）。貼り付けが途中で切れている可能性`;
  return null;
}

/** SSE の1ブロックのうち、ここで使う部分だけ（`any` を持ち込まないため） */
interface GeminiStreamChunk {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * SSE のバッファから、取り出せる本文だけを取り出す純粋関数。
 * ネットワークの切れ目はブロックの途中に来るので、**未完のブロックは rest に残す**。
 */
export function consumeSse(buffer: string): { texts: string[]; rest: string } {
  const texts: string[] = [];
  const blocks = buffer.split("\n\n");
  // 最後の要素は「まだ終わっていないブロック」かもしれないので残す
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as GeminiStreamChunk;
        for (const part of json.candidates?.[0]?.content?.parts ?? []) {
          if (part.text) texts.push(part.text);
        }
      } catch {
        // 壊れたブロックは捨てる。ここで落とすと画面が真っ白になる（退避のほうが安い）
      }
    }
  }
  return { texts, rest };
}

export interface GeminiStreamOptions {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
  /** テスト用に差し替える（既定はグローバルの fetch） */
  fetchImpl?: typeof fetch;
}

/** 生成された本文を、届いた順に流す。失敗は例外で返す（呼び出し側がフォールバックする）。 */
export async function* streamGeminiText(o: GeminiStreamOptions): AsyncGenerator<string> {
  const doFetch = o.fetchImpl ?? fetch;
  const res = await doFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${o.model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
      signal: o.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: o.system }] },
        contents: [{ role: "user", parts: [{ text: o.user }] }],
      }),
    },
  );

  if (!res.ok || !res.body) {
    // 本文は原因の手がかりになるが、鍵は載らない（載せているのはヘッダ）
    const detail = res.body ? (await res.text()).slice(0, 200) : "本文が空";
    throw new Error(`Gemini API エラー: HTTP ${res.status} ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { texts, rest } = consumeSse(buffer);
      buffer = rest;
      for (const t of texts) yield t;
    }
  } finally {
    // 呼び出し側が途中で打ち切る（G-1 不合格・タイムアウト）ことが前提なので、
    // 読み残した接続をここで必ず閉じる。閉じ損ねると未処理の rejection として表に出る。
    reader.cancel().catch(() => {});
  }
}
