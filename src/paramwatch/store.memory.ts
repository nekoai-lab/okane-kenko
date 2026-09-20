/** テストと開発用のインメモリ実装（フェーズ2b）。Firestore と同じ振る舞いを最小で満たす。 */
import type {
  CreateProposalInput,
  ProposalRecord,
  ProposalStatus,
  ProposalStore,
  WatchRunLogEntry,
} from "./store.js";

export function createMemoryProposalStore(): ProposalStore {
  const proposals = new Map<string, ProposalRecord>();
  const runLog: WatchRunLogEntry[] = [];
  let seq = 0;

  return {
    async listProposals() {
      return [...proposals.values()];
    },
    async createProposal(input: CreateProposalInput) {
      seq += 1;
      const id = `p${seq}`;
      proposals.set(id, { id, ...input, status: "pending", decidedAt: null });
      return id;
    },
    async decide(id: string, status: Exclude<ProposalStatus, "pending">, at: string) {
      const p = proposals.get(id);
      if (!p) throw new Error(`提案が見つかりません: ${id}`);
      proposals.set(id, { ...p, status, decidedAt: at });
    },
    async appendRunLog(entry: WatchRunLogEntry) {
      runLog.push(entry);
    },
    async listRunLog(limit: number) {
      return runLog.slice(-limit).reverse();
    },
  };
}
