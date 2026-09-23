/**
 * 「値は動かないが、一次情報で確かめられた」ときの提案を組み立てる（2026-09-23・D6）。
 *
 * **値の変更と検証の昇格は別の概念なので、別の名前で扱う**（判定の軸名規約と同じ思想）。
 * 昇格の提案は `changes` を空にしたまま `verifications` に載せる。
 * そうすると「**金額は1円も動かない**」が、型（`changes` が空）でも画面でも言える。
 *
 * **エージェントが書くのは、解消できたものの削除まで。**
 * 新しい一時状態（次の改正予定など）の文面は制度の読み取りを含む判断なので、
 * 人が適用コミットで書く。「AI に金額を作らせない」の隣にある「AI に制度解釈の文章を作らせない」。
 */
import type { ResolvedTarget } from "./paths.js";
import type { YamlOp } from "./yamlPatch.js";

/** 昇格する台帳1つぶん。**値は据え置きであることを、値ごと載せて示す** */
export interface VerificationChange {
  /** 監視対象のキー（params 上の位置） */
  key: string;
  label: string;
  /** 一次情報と一致した現在値。**変えない** */
  value: number;
  from: boolean;
  to: boolean;
}

export interface VerifyTarget {
  key: string;
  label: string;
  target: ResolvedTarget;
  value: number;
}

/**
 * 昇格できる対象か。**台帳があって `verified: false` のものだけ**。
 * 台帳を持たない値（`public` 系）は、そもそも昇格の記録先が無いので対象にしない。
 */
export function isPromotable(t: ResolvedTarget): boolean {
  return t.ledger !== undefined && t.ledger.verified === false;
}

/**
 * 昇格の yaml 操作。**まとまりで台帳を共有する値は1回だけ書く**
 * （5値それぞれに同じ操作を積むと、同じ行を5回書き換える差分になる）。
 *
 * `legacyVerifiedPath` は、同じ事実を別の場所にも持っている場合の受け皿。
 * 高額療養費は `kogaku.multipleOccurrenceVerified` が算定側の門になっており、
 * **台帳だけ真にしても製品は「未確認」のまま**なので、2か所を必ず一緒に動かす。
 */
export function verifyOps(
  targets: VerifyTarget[],
  legacyVerifiedPaths: Record<string, string[]> = {},
): YamlOp[] {
  const seen = new Set<string>();
  const ops: YamlOp[] = [];
  for (const t of targets) {
    const base = t.target.ledgerPath;
    if (!base) continue;
    const id = base.join(".");
    if (seen.has(id)) continue;
    seen.add(id);

    ops.push({ kind: "set", path: [...base, "verified"], value: true });
    // **解消できた改正予定だけを消す。** 新しい予定は人が書く
    if (t.target.ledger?.pendingChange) {
      ops.push({ kind: "delete", path: [...base, "pendingChange"] });
    }
    const legacy = legacyVerifiedPaths[id];
    if (legacy) ops.push({ kind: "set", path: legacy, value: true });
  }
  return ops;
}

/** 承認画面と提案に載せる昇格の一覧 */
export function verificationChanges(targets: VerifyTarget[]): VerificationChange[] {
  return targets.map((t) => ({
    key: t.key,
    label: t.label,
    value: t.value,
    from: false,
    to: true,
  }));
}
