/**
 * 監視対象の params 上の位置（フェーズ2b・2026-09-22 拡張）。
 *
 * **`public` の外も見る。** 給付制限（`kihonTeate.restrictionMonthsVoluntary`）のような
 * 制度式パラメータは `public` の外にあり、2026-09-21 まで監視の対象から外れていた（T-G）。
 *
 * `watch-sources.yaml` の `key` の書き方：
 * - ドット無し（例 `izokuKisoBase`）＝ `public.<key>.value`（従来どおり）
 * - ドット区切り（例 `kihonTeate.restrictionMonthsVoluntary`）＝ その位置の数値そのもの
 *
 * **台帳（ledger）は新しく作らない。** 制度式パラメータは `<section>.sources.<leaf>` に
 * 出典・施行日・期限・改正予定を既に持っている（2026-09-21 新設）。それを読むだけにする。
 */
import type { ParamSet, StatutorySource } from "../params/index.js";

export interface ResolvedTarget {
  /** params 上の位置（数値そのものまで） */
  path: string[];
  current: number;
  label: string | undefined;
  /** 何を疑うべきかの台帳。`public` の値は持たない（出典は文字列の `source` だけ） */
  ledger: StatutorySource | undefined;
}

function toPath(key: string): string[] {
  return key.includes(".") ? key.split(".") : ["public", key, "value"];
}

function getAt(root: unknown, path: string[]): unknown {
  let node: unknown = root;
  for (const k of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[k];
  }
  return node;
}

/** 監視対象の位置と現行値。**params に無い・数値でない位置は `undefined`**（黙って足さない） */
export function resolveTarget(p: ParamSet, key: string): ResolvedTarget | undefined {
  const path = toPath(key);
  const current = getAt(p, path);
  if (typeof current !== "number") return undefined;

  if (path[0] === "public") {
    return { path, current, label: p.public[path[1]]?.label, ledger: undefined };
  }
  // 制度式パラメータ：`<section>.<leaf>` の台帳は `<section>.sources.<leaf>`
  const ledger = getAt(p, [...path.slice(0, -1), "sources", path[path.length - 1]]);
  return {
    path,
    current,
    label: undefined,
    ledger: ledger && typeof ledger === "object" ? (ledger as StatutorySource) : undefined,
  };
}

/** 候補値を書き込む。**呼び出し側が複製した ParamSet にだけ使う**（`params/` には触れない） */
export function setAt(p: ParamSet, path: string[], value: number): void {
  const parent = getAt(p, path.slice(0, -1));
  if (parent === null || typeof parent !== "object") {
    throw new Error(`監視対象が params に無い: ${path.join(".")}`);
  }
  (parent as Record<string, unknown>)[path[path.length - 1]] = value;
}

/** 台帳の中身を1行にする（行動ログと承認画面用）。**判断はしない。書いてあることを見せるだけ** */
export function describeLedger(ledger: StatutorySource | undefined, now: Date): string {
  if (!ledger) return "台帳なし（public の値。出典は source 文字列のみ）";
  const parts = [`施行 ${ledger.effectiveFrom}`, `verified: ${ledger.verified}`];
  if (ledger.revisionCycle) parts.push(`改定周期 ${ledger.revisionCycle}`);
  if (ledger.expires) {
    const days = Math.ceil(
      (new Date(`${ledger.expires}T00:00:00+09:00`).getTime() - now.getTime()) / 86_400_000,
    );
    parts.push(`期限 ${ledger.expires}（${days >= 0 ? `あと${days}日` : `${-days}日超過`}）`);
  }
  if (ledger.pendingChange) parts.push("改正予定あり（pendingChange）");
  return parts.join("／");
}
