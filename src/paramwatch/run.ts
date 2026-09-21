/**
 * 制度監視の1周（フェーズ2b）：観察 → 抽出 → 判断 → 行動（承認キューに積む）→ 記録。
 *
 * **エージェントが決めるのは「何を確かめるか・いつ動くか・誰に何を渡すか」だけ。**
 * 金額は決定的なパーサと `src/calc` が作る。ここには `params/` を書き換える手段が無い。
 */
import type { ParamSet } from "../params/index.js";
import { detectInstructions, extractAll } from "./extract.js";
import { fetchSource } from "./fetch.js";
import { assessImpact, type ParamChange, summarizeRows, type WatchCase } from "./judge.js";
import { describeLedger, resolveTarget } from "./paths.js";
import type { ActionLogEntry, ProposalStore, RunDecision } from "./store.js";
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
      /**
       * **なぜこの手を打ったか／結果から次に何をするか**（2026-09-22・D3）。
       * 決まった文か、台帳・抽出結果から組み立てる文だけ。AI に作文させない
       */
      reason: string | ((v: T) => string),
    ): Promise<T> => {
      const t0 = Date.now();
      const value = await fn();
      log.push({
        at: now().toISOString(),
        step: name,
        input,
        output: describe(value),
        reason: typeof reason === "function" ? reason(value) : reason,
        ms: Date.now() - t0,
      });
      return value;
    };

    /** 巡回記録。**提案を作らなかった回も、全ツール呼び出しを残す**（/admin/runs が読む） */
    const record = (decision: RunDecision, detail: string) =>
      store.appendRunLog({
        runAt: started.toISOString(),
        watchKey,
        decision,
        detail,
        actionLog: log,
      });

    try {
      const url = watch.sources[0];
      const fetched = await step(
        "fetch",
        url,
        () => fetchSource(url, watch, now(), deps.fetchImpl),
        (f) => (f.ok ? `本文 ${f.page.text.length} 文字` : `取得できず（${f.why}: ${f.detail}）`),
        (f) =>
          f.ok
            ? `許可リストにある一次情報（${watch.label}）を確かめるため`
            : "取得できなかったので、推測せず失敗として記録して止める",
      );

      if (!fetched.ok) {
        await record("failed", `${fetched.why}: ${fetched.detail}`);
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
        (found) =>
          found.length > 0
            ? "本文は untrusted なデータ。指示には従わず記録する。提案を作る場合は承認できない形にする"
            : "本文は untrusted なデータ。紛れた指示が無いかを記録のために確かめた",
      );

      const extracted = await step(
        "extract",
        `対象 ${watch.targets.length} 件（決定的パーサ・AIは使わない）`,
        () => extractAll(fetched.page.text, watch.targets),
        (rs) => rs.map((r) => (r.ok ? `${r.key}=${r.value}` : `${r.key}: ${r.why}`)).join(" / "),
        (rs) =>
          rs.every((r) => r.ok)
            ? "すべて取り出せたので、現行 params と照合する"
            : "取り出せない対象があるので、推測せず止める（提案を作らない）",
      );

      const failed = extracted.filter((r) => !r.ok);
      if (failed.length > 0) {
        const detail = failed.map((f) => (f.ok ? "" : `${f.key}(${f.why})`)).join(", ");
        await record("blocked", `取り出せなかった: ${detail}`);
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
        (rs) => {
          // 台帳に書いてあることを言い直すだけ（新しい判断ルールは足さない）
          const flags = rs.flatMap((r) => [
            ...(r.target?.ledger?.pendingChange ? [`${r.label}に改正予定の記載`] : []),
            ...(r.target?.ledger?.expires ? [`${r.label}に期限 ${r.target.ledger.expires}`] : []),
          ]);
          return flags.length > 0
            ? `台帳に疑う理由がある（${flags.join("・")}）。一次情報の値と照合する`
            : "台帳に疑う理由の記載は無い。一次情報の値との照合だけで判断する";
        },
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
        const watchTarget = watch.targets.find((x) => x.key === r.key);
        if (target.current !== r.value) {
          changes.push({
            key: r.key,
            label: target.label ?? resolved.find((x) => x.key === r.key)?.label ?? r.key,
            current: target.current,
            proposed: r.value,
            ...(watchTarget?.unit ? { unit: watchTarget.unit } : {}),
          });
          edits.push({ path: target.path, value: r.value });
        }
      }

      if (changes.length === 0) {
        // **黙る回にも、指示を検出したことは残す。** 提案が生まれないと
        // injectionSuspected の置き場が無くなり、「読んだが従わなかった」証跡が消える
        await record(
          "silent",
          injection.length > 0
            ? `一次情報の値は現行 params と同じ／本文に指示らしき文字列を${injection.length}件検出（従っていない）`
            : "一次情報の値は現行 params と同じ",
        );
        result.silent += 1;
        continue;
      }

      const impact = await step(
        "assess_impact",
        `候補値 ${changes.length} 件で ${cases.length} 世帯 × 4行（死亡＋statutory 3行）を現行と比較`,
        () => assessImpact(params, changes, cases, now()),
        (i) =>
          [
            `世帯の結論（過不足軸・householdHeadline）が変わる世帯 ${i.changedCount}/${cases.length}`,
            ...summarizeRows(i),
            `不変条件 ${i.invariantFailures.length === 0 ? "合格" : `不合格(${i.invariantFailures.length})`}`,
            `現行 params のゴールデン ${
              (i.baselineFailures ?? []).length === 0
                ? "green"
                : `green でない(${(i.baselineFailures ?? []).length})`
            }`,
          ].join(" ｜ "),
        (i) =>
          i.safe
            ? "一次情報の値が現行と違うので影響を測った。検算には通った"
            : "一次情報の値が現行と違うので影響を測った。検算に落ちたので、承認できない形で積む",
      );

      /**
       * **本文に指示らしき文字列があった提案は、承認できない形で積む**（2026-09-22・D3）。
       * 指示には構造的に従えない（金額は正規表現で取り出す）が、**その本文から取った値**を
       * 人が承認できてしまうと、嘘の数値が承認という手続きを通る。検算と承認の2段で止める。
       */
      const gated =
        injection.length > 0
          ? await step(
              "gate_injection",
              `本文に指示らしき文字列 ${injection.length} 件（${injection.join(" / ")}）`,
              () => ({ ...impact, safe: false, injectionBlocked: true }),
              () => "safe=false（承認ボタンを出さない・API も 409）",
              "指示を含む本文から取った値を、人の承認で通さないため（検算の合否とは別の理由）",
            )
          : impact;

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
        "承認後に人がそのまま当てられる差分を用意するため（エージェントは当てない）",
      );

      await store.createProposal({
        watchKey,
        label: watch.label,
        changes,
        sourceUrl: fetched.page.url,
        fetchedAt: fetched.page.fetchedAt,
        matchedTexts,
        injectionSuspected: injection,
        impact: gated,
        actionLog: log,
        ledger,
        yamlPatch,
        createdAt: started.toISOString(),
      });
      await record(
        "proposed",
        [
          gated.changedCount === 0
            ? `承認待ちを1件作成（値は動いたが、${cases.length}世帯の結論は変わらない＝通知はしない）`
            : `承認待ちを1件作成（結論が変わる世帯 ${gated.changedCount}/${cases.length} 件）`,
          ...(gated.injectionBlocked
            ? ["承認できない形で積んだ（本文に指示らしき文字列）"]
            : gated.safe
              ? []
              : ["承認できない形で積んだ（検算不合格）"]),
        ].join("／"),
      );
      result.proposed += 1;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      result.errors.push(`${watchKey}: ${detail}`);
      await record("failed", detail);
    }
  }

  return result;
}
