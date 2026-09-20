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
 *
 * 2026-08-30 に `gemini-2.5-flash` から変更した。理由は2つ：
 * - **2.5 世代は閉じ始めている**（`gemini-2.5-pro` は「新規ユーザーには提供終了」で 404）
 * - テスト運用のあいだは安いほうで回す。実測 1診断あたり約0.72円（pro 帯は約5.07円）
 */
const DEFAULT_MODEL = "gemini-3.7-flash";

export function narrationModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * 貼り付けで混入する「目に見えない文字」を落とす。
 *
 * ブラウザからコピーすると、ゼロ幅スペース（U+200B〜U+200D）・BOM（U+FEFF）・
 * 改行なし空白（U+00A0）が前後に付いてくることがある。**これらは `\s` に一致しない**ので、
 * 空白の検査をすり抜けたまま「AIza で始まっていない」という的外れな理由に化ける。
 * 実際にそれで1往復むだにした（2026-08-30）。
 */
export function sanitizeApiKey(raw: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字の混入こそ落としたい対象
  return raw.replace(/[\s\u0000-\u001F\u007F\u00A0\u200B-\u200D\u2060\uFEFF]/g, "");
}

export interface ApiKeyCheck {
  /** 実際に使う鍵（目に見えない文字を落としたもの） */
  key: string;
  /** 直したうえで使ったときの注意。null なら素直な形だった */
  note: string | null;
  /** これがあると呼び出せない。null なら形は妥当 */
  problem: string | null;
  /**
   * 形の実測。**値は含めない**（文字数・バイト数と、先頭4文字のコードポイントだけ）。
   * 先頭4文字は正しい鍵なら `AIza` 固定で、秘密の部分ではない。
   * これが無いと「AIza で始まっていない」の理由が推測になり、往復が増える。
   */
  shape: string;
}

/**
 * 鍵の「形」だけを検査する。**値そのものは決して出さない。**
 *
 * Google は取り違えの理由を返さず `400 API key not valid` としか言わないので、
 * よくある貼り付け事故をここで先に言う。形がおかしいまま動かすと、フォールバックが
 * 出続けるだけで原因が見えない（この製品がいちばん避けたい「静かな壊れ方」）。
 */
export function checkApiKey(raw: string): ApiKeyCheck {
  const key = sanitizeApiKey(raw);
  const removed = raw.length - key.length;
  const note =
    removed > 0
      ? `目に見えない文字が${removed}文字混ざっていたので取り除いて使った（.env.local を貼り直しておくと確実）`
      : null;

  const head = [...key]
    .slice(0, 4)
    .map((c) => `U+${c.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}(${c})`)
    .join(" ");
  const shape = `文字数:${key.length} / バイト:${new TextEncoder().encode(key).length} / 先頭4文字:${head}`;

  const problem = ((): string | null => {
    if (/^["']|["']$/.test(key)) return "引用符が含まれている（.env.local に引用符は不要）";
    // 手順書の `GEMINI_API_KEY=<実値>` を、山カッコごと貼ってしまう事故。実際に踏んだ（2026-08-30）。
    // 「AIza で始まっていない」とだけ言うと原因にたどり着けないので、名指しする。
    if (/^<.*>$/.test(key)) return "山カッコ <> で囲まれている（手順書の <実値> ごと貼られている）";
    // **先頭が AIza かどうかで弾かない。** 2026-09-20、AI Studio が発行した有効な鍵
    // （Google に直接投げて 200 が返る）を、この条件だけで拒否して半日止まった。
    // 鍵の形式は Google の都合で増える。**こちらの知っている形を正解にしない。**
    // 妥当性の最終判断は Google に任せ、ここは「明らかな貼り付け事故」だけを見る。
    if (key.length < 30) return `短すぎる（${key.length}文字）。貼り付けが途中で切れている可能性`;
    return null;
  })();

  // 見慣れない形は「止める理由」ではなく「調べる手がかり」として添える。
  const prefixNote =
    problem === null && !key.startsWith("AIza")
      ? "AIza で始まらない形式の鍵（新しい形式の可能性）。呼び出しは試みる"
      : null;

  return { key, note: note ?? prefixNote, problem, shape };
}

/** SSE の1ブロックのうち、ここで使う部分だけ（`any` を持ち込まないため） */
interface GeminiStreamChunk {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * SSE のバッファから、取り出せる本文だけを取り出す純粋関数。
 * ネットワークの切れ目はブロックの途中に来るので、**未完のブロックは rest に残す**。
 *
 * `finishReason` も拾う。本文が来ないまま終わったとき、これが無いと
 * 「空だった」としか言えず原因にたどり着けない（MAX_TOKENS なのか SAFETY なのかで対処が違う）。
 */
export function consumeSse(buffer: string): {
  texts: string[];
  rest: string;
  finishReason: string | null;
} {
  const texts: string[] = [];
  let finishReason: string | null = null;
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
        finishReason =
          json.candidates?.[0]?.finishReason ?? json.promptFeedback?.blockReason ?? finishReason;
      } catch {
        // 壊れたブロックは捨てる。ここで落とすと画面が真っ白になる（退避のほうが安い）
      }
    }
  }
  return { texts, rest, finishReason };
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
  let emitted = 0;
  let finish: string | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { texts, rest, finishReason } = consumeSse(buffer);
      buffer = rest;
      if (finishReason) finish = finishReason;
      for (const t of texts) {
        emitted += t.length;
        yield t;
      }
    }

    // **最後のブロックを取りこぼさない。** 読み込み中は「途中かもしれない」ブロックを
    // rest に残しているので、ストリームが終わった時点で必ず1回吐き出す。
    // 終端の空行が付かないことがあり、そのときは本文がまるごと消える（実際に消えた）。
    if (buffer.trim() !== "") {
      const tail = consumeSse(`${buffer}\n\n`);
      if (tail.finishReason) finish = tail.finishReason;
      for (const t of tail.texts) {
        emitted += t.length;
        yield t;
      }
    }

    // 一文字も来ないまま終わったら、理由を付けて投げる。「空だった」だけでは
    // 打つ手が決まらない（MAX_TOKENS なら思考の上限、SAFETY なら文面の問題）。
    if (emitted === 0) {
      throw new Error(`本文が1文字も返らなかった（finishReason=${finish ?? "不明"}）`);
    }
  } finally {
    // 呼び出し側が途中で打ち切る（G-1 不合格・タイムアウト）ことが前提なので、
    // 読み残した接続をここで必ず閉じる。閉じ損ねると未処理の rejection として表に出る。
    reader.cancel().catch(() => {});
  }
}
