/**
 * 値を変える提案に、台帳（`<section>.sources.<leaf>`）を自己整合させる操作を足す（2026-09-22・D4）。
 *
 * **材料は2つだけ**：台帳にいま書いてあることと、一次情報で一致した文（＋その URL と取得日）。
 * エージェントが note を自由に作文する経路を作らない（AI に数字だけでなく根拠文も作らせない）。
 *
 * - `pendingChange`（改正予定）は消す ── 適用したら「予定」ではなくなる
 * - `expires` は、`pendingChange` と組のとき（＝温存の期限）だけ消す。
 *   改定周期の「次の改定日」という意味の `expires` は、値が変わっても次の改定日のままなので残す
 * - `effectiveFrom` は一致文の和暦の日付を西暦にして入れる。**一致文に日付が無ければ null**（作らない）
 * - `note` は上の材料だけで組んだ定型文に置き換える
 * - 消す・書き直すキーの直前の説明コメントも消す（旧状態の説明なので、残すと矛盾する）
 */
import type { ResolvedTarget } from "./paths.js";
import { jstDate } from "../time/jstYear.js";
import { firstWarekiDate } from "./wareki.js";
import type { YamlOp } from "./yamlPatch.js";

export interface MatchEvidence {
  matchedText: string;
  sourceUrl: string;
  fetchedAt: string;
}

export function ledgerOps(target: ResolvedTarget, ev: MatchEvidence): YamlOp[] {
  const ledger = target.ledger;
  if (!ledger) return [];
  const base = [...target.path.slice(0, -1), "sources", target.path[target.path.length - 1]];
  const at = (key: string) => [...base, key];

  const effectiveFrom = firstWarekiDate(ev.matchedText);
  const note = [
    effectiveFrom ? `${effectiveFrom} 施行の値。` : "一次情報の一致文に施行日の記載なし。",
    `一次情報の一致文「${ev.matchedText}」`,
    `（${ev.sourceUrl}・${jstDate(new Date(ev.fetchedAt))} 取得）。`,
  ].join("");

  const ops: YamlOp[] = [{ kind: "replace", path: at("effectiveFrom"), value: effectiveFrom }];
  if (ledger.pendingChange) {
    ops.push({ kind: "delete", path: at("pendingChange") });
    if (ledger.expires) ops.push({ kind: "delete", path: at("expires") });
  }
  // note が台帳に無い場合は足さない（キーを足す操作は持たない＝差分の形を増やさない）
  if ((ledger as { note?: string }).note !== undefined) {
    ops.push({ kind: "replace", path: at("note"), value: note });
  }
  return ops;
}
