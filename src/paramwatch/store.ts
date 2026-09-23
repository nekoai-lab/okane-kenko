/**
 * 制度監視が積む「承認待ち」の型と保存先インターフェース（フェーズ2b）。
 *
 * **エージェントは提案を積むだけで、`params/` には触れない。**
 * 承認は「人間が確認した」という記録であって、YAML の更新は人間が PR で行う。
 * 取り消せない操作をエージェントに渡さない、という一点のためにこの層がある。
 *
 * 実装（Firestore）はテストから切り離すため、ここはインターフェースだけを置く。
 */
import type { Impact, ParamChange } from "./judge.js";
import type { VerificationChange } from "./verifyOps.js";

/** 1回の巡回で何をしたか。**全ツール呼び出しを時系列で読める形にする**（審査軸②の証跡） */
export interface ActionLogEntry {
  at: string;
  /** 何をしたか（fetch / extract / judge / decide） */
  step: string;
  /** 入力の要約。**本文そのものは載せない**（長すぎるうえ、載せる意味がない） */
  input: string;
  /** 出力の要約 */
  output: string;
  /**
   * 判断理由：なぜこの手を打ったか／結果から次に何をするか（2026-09-22・D3）。
   * 決まった文か台帳・抽出結果から組み立てた文だけ（AI の作文ではない）。それ以前の記録には無い
   */
  reason?: string;
  ms: number;
}

export type ProposalStatus = "pending" | "approved" | "rejected";

export interface ProposalRecord {
  id: string;
  watchKey: string;
  label: string;
  changes: ParamChange[];
  sourceUrl: string;
  fetchedAt: string;
  /** 根拠として残す本文の一部。**そのまま引用する**（要約すると検証できない） */
  matchedTexts: string[];
  /** 本文に指示らしき文字列があったか。**従わなかったことの証跡** */
  injectionSuspected: string[];
  impact: Impact;
  actionLog: ActionLogEntry[];
  /**
   * 対象ごとの台帳（出典・施行日・期限・改正予定）を1行ずつ。**判断はせず、書いてあることを見せる**。
   * 2026-09-22 追加。それ以前の提案には無い
   */
  ledger?: string[];
  /**
   * **値は動かさず、`verified: false → true` だけを提案するとき**に入る（2026-09-23・D6）。
   * 値の変更（`changes`）とは別の概念なので、別の名前で持つ。
   * これがあって `changes` が空なら「**金額は1円も動かない**検証の昇格」である
   */
  verifications?: VerificationChange[];
  /**
   * `git apply` がそのまま通る unified diff。**承認しても当たらない。当てるのは人**（コミット・push）。
   * 2026-09-22 追加。それ以前の提案には無い
   */
  yamlPatch?: string;
  status: ProposalStatus;
  createdAt: string;
  decidedAt: string | null;
}

/**
 * `skipped` は「ズレはあるが、同じ候補値の承認待ちが既にある」回（2026-09-23・D5 の前提）。
 * **`silent`（制度が動いていない）と分ける。** skipped が続くのは**人の承認が溜まっている**という意味で、
 * 読み手にとって別の知らせになる
 */
export type RunDecision = "proposed" | "silent" | "skipped" | "blocked" | "failed";

/** 提案を作らなかった回も残す。**沈黙も設計のうち**（2a の notice_log と同じ思想） */
export interface WatchRunLogEntry {
  runAt: string;
  watchKey: string;
  decision: RunDecision;
  detail: string;
  /** その回の全ツール呼び出し（2026-09-22・D3）。**提案を作らなかった回も残す**。それ以前の記録には無い */
  actionLog?: ActionLogEntry[];
}

export interface CreateProposalInput {
  watchKey: string;
  label: string;
  changes: ParamChange[];
  /** 検証の昇格（値は動かない）。2026-09-23・D6 */
  verifications?: VerificationChange[];
  sourceUrl: string;
  fetchedAt: string;
  matchedTexts: string[];
  injectionSuspected: string[];
  impact: Impact;
  actionLog: ActionLogEntry[];
  ledger: string[];
  yamlPatch: string;
  createdAt: string;
}

export interface ProposalStore {
  listProposals(): Promise<ProposalRecord[]>;
  createProposal(input: CreateProposalInput): Promise<string>;
  decide(id: string, status: Exclude<ProposalStatus, "pending">, at: string): Promise<void>;
  appendRunLog(entry: WatchRunLogEntry): Promise<void>;
  listRunLog(limit: number): Promise<WatchRunLogEntry[]>;
}
