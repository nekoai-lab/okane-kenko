/**
 * 「T-G 適用直前の params」をテストに渡す（2026-09-23）。
 *
 * 制度監視のテストは、**改正がまだ反映されていない params** を相手にしないと成り立たない
 * （見つけるべきズレが無くなるため）。T-G を本物の `params/2026-08.yaml` に適用した時点で、
 * 生きた params を読んでいた検査は前提ごと消えた。ここが、その前提を保つ唯一の置き場。
 *
 * **凍結コピーであって制度の正本ではない。** 値を引くときは `params/` を見ること。
 *
 * **地雷の除去（次に触る人へ）**：`yamlPatch.test.ts` の「本物の params にも当たる」検算は、
 * いま生きた params と一次情報がズレている**遺族基礎年金の2件**に依存している。
 * その2件を適用したらズレが消えて検算が空回りするので、そのときは
 * **このコピーに新しいズレを1件足して**、検算の相手を移すこと（検査を消さない）。
 *
 * 状態語ガード（`sources.test.ts`）はこのファイルを走査しない。
 * 改正前の温存コメントを**わざと保存している**ので、対象に入れると誤爆する。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadParams } from "../../params/index.js";

const DIR = join(process.cwd(), "src/paramwatch/__fixtures__");

/** T-G 適用直前の ParamSet（給付制限は 2 か月、台帳に pendingChange と expires がある） */
export const PRE_TG = loadParams("pre-tg", DIR);

/** 同じ内容の YAML 全文。差分を作る側のテストが使う */
export const PRE_TG_TEXT = readFileSync(join(DIR, "pre-tg.yaml"), "utf-8");

/**
 * 差分のヘッダに出すパス。**本物の params のパスを名乗らせる**
 * ── 提案に載る差分は、人が `params/2026-08.yaml` に当てるものだから。
 */
export const PRE_TG_FILE = "params/2026-08.yaml";
