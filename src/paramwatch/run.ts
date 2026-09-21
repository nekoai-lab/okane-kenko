/**
 * 制度監視の1周（フェーズ2b）：観察 → 抽出 → 判断 → 行動（承認キューに積む）→ 記録。
 *
 * **エージェントが決めるのは「何を確かめるか・いつ動くか・誰に何を渡すか」だけ。**
 * 金額は決定的なパーサと `src/calc` が作る。ここには `params/` を書き換える手段が無い。
 */
import type { ParamSet } from "../params/index.js";
import { detectInstructions, extractAll } from "./extract.js";
import { fetchSource } from "./fetch.js";
import { assessImpact, type ParamChange, type WatchCase } from "./judge.js";
import { describeLedger, resolveTarget } from "./paths.js";
import type { ActionLogEntry, ProposalStore } from "./store.js";
import type { WatchSources } from "./sources.js";
import { buildYamlPatch } from "./yamlPatch.js";

export interface RunParamWatchResult {
  checked: number;
  proposed: number;
  silent: number;
  errors: string[];
}

export interface RunParamWatchDeps {
  params: ParamSet;
  sources: WatchSources;
  cases: WatchCase[];
  store: ProposalStore;
  /**
   * `params` の元になった YAML の全文とリポジトリ上のパス。**提案に載せる差分を作るためだけに使う**。
   * ここから params を書き換える経路は無い（差分は文字列として承認キューに積まれるだけ）
   */
  paramsYaml: { file: string; text: string };
  now: () => Date;
  fetchImpl?: typeof fetch;
}

export async function runParamWatch(deps: RunParamWatchDeps): Promise<RunParamWatchResult> {
  const { params, sources, cases, store, now } = deps;
  const result: RunParamWatchResult = { checked: 0, proposed: 0, silent: 0, errors: [] };

  for (const [watchKey, watch] of Object.entries(sources.watches)) {
    const log: ActionLogEntry[] = [];
    const started = now();
    result.checked += 1;

    const step = async <T>(
      name: string,
      input: string,
      fn: () => Promise<T> | T,
      describe: (v: T) => string,
    ): Promise<T> => {
      const t0 = Date.now();
      const value = await fn();
      log.push({
        at: now().toISOString(),
        step: name,
        input,
        output: describe(value),
        ms: Date.now() - t0,
      });
      return value;
    };

    try {
      const url = watch.sources[0];
      const fetched = await step(
        "fetch",
        url,
        () => fetchSource(url, watch, now(), deps.fetchImpl),
        (f) => (f.ok ? `本文 ${f.page.text.length} 文字` : `取得できず（${f.why}: ${f.detail}）`),
      );

      if (!fetched.ok) {
        await store.appendRunLog({
          runAt: started.toISOString(),
          watchKey,
          decision: "failed",
          detail: `${fetched.why}: ${fetched.detail}`,
        });
        result.errors.push(`${watchKey}: ${fetched.why}`);
        continue;
      }

      // 本文は untrusted。**指示は探すが、従うためではなく記録して見せるため。**
      const injection = await step(
        "detect_instructions",
        "取得した本文（untrusted）",
        () => detectInstructions(fetched.page.text),
        (found) =>
          found.length > 0
            ? `指示らしき文字列を${found.length}件検出（従わない）`
            : "指示は検出されず",
      );

      const extracted = await step(
        "extract",
        `対象 ${watch.targets.length} 件（決定的パーサ・AIは使わない）`,
        () => extractAll(fetched.page.text, watch.targets),
        (rs) => rs.map((r) => (r.ok ? `${r.key}=${r.value}` : `${r.key}: ${r.why}`)).join(" / "),
      );

      const failed = extracted.filter((r) => !r.ok);
      if (failed.length > 0) {
        const detail = failed.map((f) => (f.ok ? "" : `${f.key}(${f.why})`)).join(", ");
        await store.appendRunLog({
          runAt: started.toISOString(),
          watchKey,
          decision: "blocked",
          detail: `取り出せなかった: ${detail}`,
        });
        result.errors.push(`${watchKey}: ${detail}`);
        continue;
      }

      // **何を疑うべきかは params の台帳が知っている。** 新しい判断ルールは足さず、読んで記録する
      const resolved = await step(
        "read_params",
        `対象 ${watch.targets.length} 件の現行値と台帳（sources）`,
        () =>
          watch.targets.map((t) => ({
            key: t.key,
            label: t.label,
            target: resolveTarget(params, t.key),
          })),
        (rs) =>
          rs
            .map((r) =>
              r.target
                ? `${r.key}=${r.target.current}（${describeLedger(r.target.ledger, now())}）`
                : `${r.key}: params に無い`,
            )
            .join(" / "),
      );
      const ledger = resolved.map((r) =>
        r.target
          ? `${r.label}：${describeLedger(r.target.ledger, now())}`
          : `${r.label}：params に無い`,
      );

      const changes: ParamChange[] = [];
      const edits: Array<{ path: string[]; value: number }> = [];
      const matchedTexts: string[] = [];
      for (const r of extracted) {
        if (!r.ok) continue;
        const target = resolved.find((x) => x.key === r.key)?.target;
        if (target === undefined) continue;
        matchedTexts.push(r.matchedText);
        if (target.current !== r.value) {
          changes.push({
            key: r.key,
            label: target.label ?? resolved.find((x) => x.key === r.key)?.label ?? r.key,
            current: target.current,
            proposed: r.value,
          });
          edits.push({ path: target.path, value: r.value });
        }
      }

      if (changes.length === 0) {
        await store.appendRunLog({
          runAt: started.toISOString(),
          watchKey,
          decision: "silent",
          // **黙る回にも、指示を検出したことは残す。** 提案が生まれないと
          // injectionSuspected の置き場が無くなり、「読んだが従わなかった」証跡が消える
          detail:
            injection.length > 0
              ? `一次情報の値は現行 params と同じ／本文に指示らしき文字列を${injection.length}件検出（従っていない）`
              : "一次情報の値は現行 params と同じ",
        });
        result.silent += 1;
        continue;
      }

      const impact = await step(
        "assess_impact",
        `候補値 ${changes.length} 件で ${cases.length} 世帯を再計算`,
        () => assessImpact(params, changes, cases),
        (i) =>
          `結論が変わる世帯 ${i.changedCount}/${cases.length} 件・不変条件 ${i.safe ? "合格" : `不合格(${i.invariantFailures.length})`}`,
      );

      /**
       * **「提案を積むか」と「人に知らせるか」は別の判断である。**
       *
       * 設計当初は「結論が変わらなければ静かにする」を提案の可否に使っていた。
       * しかし実装して測ったところ、遺族基礎年金を許容幅の下端まで動かしても
       * 10世帯の結論は1件も変わらない（2026-09-20 実測）。この規則のままだと、
       * **制度が実際に変わっても提案が永久に積まれない**。
       *
       * 制度の値が動いたなら `params/` は更新されるべきで、それは結論が変わるかとは無関係。
       * 「静かにする」は通知の強さの話なので、重要度（`impact.changedCount`）として
       * 提案に載せ、画面と通知の側で使う。
       */
      const yamlPatch = await step(
        "build_yaml_patch",
        `${deps.paramsYaml.file} の ${edits.length} か所（値の文字だけを置き換える）`,
        () => buildYamlPatch(deps.paramsYaml.file, deps.paramsYaml.text, edits),
        (patch) =>
          `unified diff ${patch.split("\n").length - 1} 行（承認しても当たらない。当てるのは人）`,
      );

      await store.createProposal({
        watchKey,
        label: watch.label,
        changes,
        sourceUrl: fetched.page.url,
        fetchedAt: fetched.page.fetchedAt,
        matchedTexts,
        injectionSuspected: injection,
        impact,
        actionLog: log,
        ledger,
        yamlPatch,
        createdAt: started.toISOString(),
      });
      await store.appendRunLog({
        runAt: started.toISOString(),
        watchKey,
        decision: "proposed",
        detail:
          impact.changedCount === 0
            ? `承認待ちを1件作成（値は動いたが、${cases.length}世帯の結論は変わらない＝通知はしない）`
            : `承認待ちを1件作成（結論が変わる世帯 ${impact.changedCount}/${cases.length} 件）`,
      });
      result.proposed += 1;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      result.errors.push(`${watchKey}: ${detail}`);
      await store.appendRunLog({
        runAt: started.toISOString(),
        watchKey,
        decision: "failed",
        detail,
      });
    }
  }

  return result;
}
