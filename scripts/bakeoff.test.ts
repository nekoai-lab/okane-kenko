/**
 * レポート品質ベイクオフ ─ T-07 のモデル選定ハーネス
 *
 * 判定の物差しは `docs/レポート品質_評価基準.md`（AI出力を1本も見ない状態で確定済み）。
 * ここが出すのは**採点の材料**であって、点数ではない。点数は人が付ける。
 *
 * 出すもの（`bakeoff-out/`・git 管理外）：
 *   blind.md … 出力元を伏せてシャッフルしたレポート。これを見ながら採点する
 *   key.json … 対応表とトークン実測・円換算。**採点が終わってから開く**
 *
 * 走らせ方：`npm run bakeoff`（`.env.local` の GEMINI_API_KEY を使う）
 * 鍵が無いときは skip し、代わりに世帯の結論の種類とプロンプトだけを出す（DRYRUN）。
 *
 * これは `.test.ts` だが `npm test`（pre-commit）からは切り離してある（vitest.bakeoff.config.ts 参照）。
 * vitest を runner に借りているだけ ─ Node の型ストリップは `.js`→`.ts` の解決をしないため。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { HouseholdDiagnosis } from "../src/calc/index.js";
import { diagnose } from "../src/calc/index.js";
import { GOLDEN } from "../src/__tests__/households.js";
import { fillPlaceholders, hasNoRawNumbers } from "../src/narrate/narrate.js";
import { checkGuardrails } from "../src/narrate/guard.js";
import { loadParams } from "../src/params/index.js";

const P = loadParams("2026-08");
/** パラメータの有効期間内に固定する（ゴールデンテストと同じ基準日） */
const AS_OF = new Date("2026-08-17T12:00:00+09:00");
const OUT_DIR = "bakeoff-out";

/**
 * 円換算の前提。**概算であり、請求額ではない。**
 * 単価は 2026-08-24 に Gemini API の公式価格ページで確認した paid tier の値。
 * 単価は変わるので、走らせるときに合っているか確かめること（NFR-12 の実測に使うため）。
 */
const USD_JPY = 150;

interface ModelSpec {
  id: string;
  /** 入力 USD / 1M トークン */
  inUsd: number;
  /** 出力 USD / 1M トークン（思考トークンも出力単価で課金される） */
  outUsd: number;
  note: string;
}

const MODELS: ModelSpec[] = [
  {
    id: "gemini-2.5-flash",
    inUsd: 0.3,
    outUsd: 2.5,
    note: "安定版。値上げ予告なし",
  },
  {
    id: "gemini-2.5-pro",
    inUsd: 1.25,
    outUsd: 10.0,
    note: "安定版。200kトークン以下の単価",
  },
  // gemini-3.7-flash は 2027-01-01 に単価が倍になる（$0.75/$3.75 → $1.50/$7.50）ので既定では外した。
  // 比較したくなったらこの配列に足すだけでよい。
];

/**
 * 結論の種類を網羅するように選ぶ。選定理由は docs/レポート品質_評価基準.md §5.1。
 *
 * 世帯像から推測して選ぶと種類が偏る（実際に偏った）ので、**算定結果の kind を実測してから**確定した。
 * ゴールデン10世帯の内訳：shortage=GT-02/06/08、reducible=GT-03/04/05/07/09/10、rebalanceable=GT-01。
 * **`all_covered` はどの世帯にも出ない**（下の it で検知している）。
 */
const CASE_IDS = ["GT-02", "GT-05", "GT-09", "GT-01"] as const;

interface Case {
  id: string;
  label: string;
  diagnosis: HouseholdDiagnosis;
}

function buildCases(): Case[] {
  const cases: Case[] = [];
  for (const id of CASE_IDS) {
    const g = GOLDEN.find((c) => c.id === id);
    if (!g) throw new Error(`世帯 ${id} が見つからない`);
    cases.push({ id, label: g.label, diagnosis: diagnose(P, g.input, AS_OF) });
  }
  // GT-01 は「保険が分からない」(pending) の書き方を見るために保障額を伏せた版も見る。
  // pending を「足りている」に潰さず中立に書けるかは、この製品の芯に直結する。
  const g01 = GOLDEN.find((c) => c.id === "GT-01");
  if (!g01) throw new Error("GT-01 が見つからない");
  cases.push({
    id: "GT-01-pending",
    label: `${g01.label}（保険が分からない）`,
    diagnosis: diagnose(P, { ...g01.input, coverageSelf: null }, AS_OF),
  });
  return cases;
}

/**
 * システムプロンプト（静）。機能仕様書 §5.5 の骨子を、いまの narrate の枠
 * （プレースホルダだけを書かせ、差し込みはこちら側）に合わせたもの。
 * §5.4 の「静的→動的」の順序に従い、変わらないものを前に置く。
 */
const SYSTEM_PROMPT = `あなたは公的保障と家計の「翻訳者」です。判断者ではありません。

# 絶対規則
1. 金額・年数・割合を、あなた自身が書いてはいけません。数字は下記のプレースホルダだけで表します。算用数字も漢数字も本文に書かないでください。
2. 保険商品の名称・保険会社名を出さない。加入や申し込みを勧める表現を使わない。
3. 不安を煽らない。「大変なことになる」「今すぐ」「絶対」のような圧をかける言い方をしない。
4. 断定的な将来予測をしない。「概算」「目安」であることを保つ。
5. 家計全体の最適化や投資の助言はしない。
6. 算定結果に「減らせる余地」があるときは必ず触れる。無いのに「ある」と書かない。

# 使えるプレースホルダ（これ以外は使用禁止）
{{conclusion}} … 結論のことば
{{selfRange}}  … 遺されたご家族に必要な保障の目安（レンジ）
{{gapAmount}}  … いまの保険との差額

# 文体
中学生が読める語彙で書く。専門用語（団信・遺族厚生年金・高額療養費）は初出で1行の注釈を添える。
「あなたの世帯では」の視点で書き、一般論を語らない。
「いまの前提では」を必ず添える。
褒めるときは状態を褒める。本人の選択に帰属できるものだけを本人のものとして書き、制度のおかげは制度のおかげと書く。

# 出力
{"template": "本文"} という JSON を返す。本文は3〜6文の日本語。`;

function buildUserContent(c: Case): string {
  const pending = c.diagnosis.self.gap.kind === "pending";
  const placeholderNote = pending
    ? "この世帯は今の保険が分かっていないため過不足を出していません。{{gapAmount}} は使わないでください。過不足を断定せず、証券が見つかれば比べられることを伝えてください。"
    : "この世帯は過不足が出ています。{{gapAmount}} を使えます。";

  // 氏名等の識別情報は渡さない（AR-09）。算定結果の構造化JSONだけを渡す。
  return `${placeholderNote}

算定結果（この中の値だけが事実です。ここに無いことを書かないでください）:
${JSON.stringify(c.diagnosis, null, 2)}`;
}

/** Gemini API のレスポンスのうち、ここで使う部分だけ（`any` を持ち込まないため） */
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

interface CallResult {
  template: string | null;
  error: string | null;
  inTokens: number;
  outTokens: number;
  thoughtTokens: number;
}

async function callGemini(model: string, apiKey: string, user: string): Promise<CallResult> {
  const empty = { template: null, inTokens: 0, outTokens: 0, thoughtTokens: 0 };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        // 鍵はヘッダで渡す。クエリ文字列に載せるとアクセスログやプロキシに残る。
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: { template: { type: "string" } },
              required: ["template"],
            },
            // 思考の深さはここでは指定しない。まず既定のまま実測し、思考トークンが
            // どれだけ出力課金に乗るかを見てから絞る（推測で設定して試算を歪めないため）。
          },
        }),
      },
    );

    if (!res.ok) {
      return { ...empty, error: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` };
    }

    const json = (await res.json()) as GeminiResponse;
    const usage = json.usageMetadata ?? {};
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    const tokens = {
      inTokens: usage.promptTokenCount ?? 0,
      outTokens: usage.candidatesTokenCount ?? 0,
      thoughtTokens: usage.thoughtsTokenCount ?? 0,
    };
    if (!text) return { ...tokens, template: null, error: "本文が空" };
    const parsed = JSON.parse(text) as { template?: string };
    return { ...tokens, template: parsed.template ?? null, error: null };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
}

/** テンプレに、こちらが差し込めないプレースホルダが混ざっていないか。 */
const KNOWN_PLACEHOLDERS = ["conclusion", "selfRange", "gapAmount"];
function unknownPlaceholders(template: string): string[] {
  const found = [...template.matchAll(/\{\{([a-zA-Z]+)\}\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((k) => !KNOWN_PLACEHOLDERS.includes(k)))];
}

interface Row {
  conditionId: string;
  model: string;
  caseId: string;
  caseLabel: string;
  kind: string;
  text: string;
  /** ok=そのまま出せる / fallback=テンプレ退避 / error=呼び出し失敗 */
  status: "ok" | "fallback" | "error";
  reason: string;
  inTokens: number;
  outTokens: number;
  thoughtTokens: number;
  yen: number;
}

function priceYen(m: ModelSpec, r: CallResult): number {
  // 思考トークンは出力単価で課金される
  const usd =
    (r.inTokens * m.inUsd) / 1_000_000 +
    ((r.outTokens + r.thoughtTokens) * m.outUsd) / 1_000_000;
  return Math.round(usd * USD_JPY * 100) / 100;
}

describe("レポート品質ベイクオフ（T-07 モデル選定）", () => {
  const cases = buildCases();
  const apiKey = process.env.GEMINI_API_KEY;

  it("世帯の選定が結論の種類を網羅している（鍵が無くても確認できる）", () => {
    // 10世帯すべての結論を出す。どの世帯がどの結論になるかは算定結果でしか分からず、
    // 世帯像からの推測で選ぶと種類が偏る（実際に偏った）。選定の根拠をここに残す。
    console.log("\n【ゴールデン10世帯の結論】");
    for (const g of GOLDEN) {
      const d = diagnose(P, g.input, AS_OF);
      console.log(
        `${g.id}\t${d.householdHeadline.kind}\t(self=${d.self.gap.kind}, spouse=${d.spouse ? d.spouse.gap.kind : "なし"})`,
      );
    }
    const kinds = cases.map((c) => `${c.id}: ${c.diagnosis.householdHeadline.kind}`);
    console.log("\n【選んだ世帯と結論の種類】\n" + kinds.join("\n"));

    // 選定漏れを機械で検知する。世帯を足したり算定を変えたりすると種類の分布が動くため。
    const corpusKinds = new Set(
      GOLDEN.map((g) => diagnose(P, g.input, AS_OF).householdHeadline.kind),
    );
    const chosenKinds = new Set(cases.map((c) => c.diagnosis.householdHeadline.kind));
    const missing = [...corpusKinds].filter((k) => !chosenKinds.has(k));
    expect(missing, `選定から漏れている結論の種類: ${missing.join(", ")}`).toEqual([]);

    // all_covered（足りている＝「入らなくていい」）を出す世帯がゴールデンに1つも無い。
    // これは芯の検証ケースなので、無いことを黙って通さずここで可視化する。
    if (!corpusKinds.has("all_covered")) {
      console.log(
        "\n⚠️ ゴールデン10世帯に all_covered（足りている）が1件も無い。" +
          "\n   「必要ないなら入らなくていい」と言えるかを検証できる世帯が corpus に存在しない。" +
          "\n   → docs/レポート品質_評価基準.md §5.1 の注記を参照。",
      );
    }
    console.log(`\n【モデル】${MODELS.map((m) => m.id).join(" / ")}`);
    console.log(`【呼び出し回数】${MODELS.length} × ${cases.length} = ${MODELS.length * cases.length}`);
    if (!apiKey) {
      console.log("\n※ GEMINI_API_KEY が未設定のため生成は skip します。");
      console.log("  .env.local に GEMINI_API_KEY を設定すると本番の比較が走ります。");
    }
    expect(cases.length).toBeGreaterThan(0);
  });

  it.skipIf(!apiKey)("各モデルでレポートを生成し、盲検用の一式を書き出す", async () => {
    if (!apiKey) return;
    const rows: Row[] = [];

    for (const m of MODELS) {
      for (const c of cases) {
        const r = await callGemini(m.id, apiKey, buildUserContent(c));
        const base = {
          model: m.id,
          caseId: c.id,
          caseLabel: c.label,
          kind: c.diagnosis.householdHeadline.kind,
          inTokens: r.inTokens,
          outTokens: r.outTokens,
          thoughtTokens: r.thoughtTokens,
          yen: priceYen(m, r),
          conditionId: "",
        };

        if (r.error || !r.template) {
          rows.push({ ...base, text: "", status: "error", reason: r.error ?? "本文なし" });
          continue;
        }

        // 差し込む前に検査する（G-1）。ここで落ちれば数値は構造的に混ざりようがない。
        const unknown = unknownPlaceholders(r.template);
        if (!hasNoRawNumbers(r.template)) {
          rows.push({ ...base, text: r.template, status: "fallback", reason: "G-1 生の数字" });
          continue;
        }
        if (unknown.length > 0) {
          rows.push({
            ...base,
            text: r.template,
            status: "fallback",
            reason: `差し込めないプレースホルダ: ${unknown.join(", ")}`,
          });
          continue;
        }

        const filled = fillPlaceholders(r.template, c.diagnosis);
        const guard = checkGuardrails(filled, c.diagnosis);
        rows.push({
          ...base,
          text: filled,
          status: guard.passed ? "ok" : "fallback",
          reason: guard.passed ? "" : `ガードレール: ${guard.violations.join(", ")}`,
        });
      }
    }

    // 出力元を伏せるため、条件IDを振ってからシャッフルする
    rows.forEach((row, i) => {
      row.conditionId = `R-${String(i + 1).padStart(2, "0")}`;
    });
    const shuffled = [...rows].sort(() => Math.random() - 0.5);

    mkdirSync(OUT_DIR, { recursive: true });

    const blind = [
      "# ベイクオフ 盲検シート",
      "",
      "`docs/レポート品質_評価基準.md` の6観点で採点する。**採点が終わるまで key.json を開かない。**",
      "観点5（芯との整合）が 0 なら、他が満点でも不合格。",
      "",
      ...shuffled.map((r) =>
        [
          `## ${r.conditionId} ／ ${r.caseId}（結論: ${r.kind}）`,
          `世帯：${r.caseLabel}`,
          "",
          r.status === "error"
            ? `> ⚠️ 生成に失敗しました（${r.reason}）`
            : r.status === "fallback"
              ? `> ⚠️ **フォールバック**（${r.reason}）← 評価基準 §3-3 により **0点**\n\n${r.text}`
              : r.text,
          "",
        ].join("\n"),
      ),
    ].join("\n");
    writeFileSync(`${OUT_DIR}/blind.md`, blind);

    const summary = MODELS.map((m) => {
      const mine = rows.filter((r) => r.model === m.id);
      const ok = mine.filter((r) => r.status === "ok").length;
      return {
        model: m.id,
        note: m.note,
        ok,
        fallback: mine.filter((r) => r.status === "fallback").length,
        error: mine.filter((r) => r.status === "error").length,
        fallbackRate: `${Math.round((1 - ok / mine.length) * 100)}%`,
        avgYenPerDiagnosis: Math.round((mine.reduce((s, r) => s + r.yen, 0) / mine.length) * 100) / 100,
        avgThoughtTokens: Math.round(mine.reduce((s, r) => s + r.thoughtTokens, 0) / mine.length),
      };
    });

    writeFileSync(
      `${OUT_DIR}/key.json`,
      JSON.stringify(
        { ranAt: AS_OF.toISOString(), usdJpy: USD_JPY, nfr12LimitYen: 10, summary, rows },
        null,
        2,
      ),
    );

    console.log(`\n【要約】\n${JSON.stringify(summary, null, 2)}`);
    console.log(`\n盲検シート → ${OUT_DIR}/blind.md（採点が終わるまで key.json を開かない）`);

    // 呼び出しが全滅していないことだけを機械で確かめる。品質の判定は人がする。
    expect(rows.filter((r) => r.status !== "error").length).toBeGreaterThan(0);
  });
});
