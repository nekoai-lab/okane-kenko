/**
 * ProposalStore の Firestore 実装（フェーズ2b）。
 *
 * 認証は Cloud Run の Application Default Credentials に委ねる（鍵をコードや env に置かない）。
 * T-13 の `src/watch/store.firestore.ts` と同じ作り。ここは意図的にユニットテストを持たない。
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type {
  CreateProposalInput,
  ProposalRecord,
  ProposalStatus,
  ProposalStore,
  WatchRunLogEntry,
} from "./store.js";

const PROPOSALS = "param_proposals";
const RUN_LOG = "param_watch_log";

function db() {
  if (getApps().length === 0) initializeApp();
  return getFirestore();
}

export function createFirestoreProposalStore(): ProposalStore {
  return {
    async listProposals() {
      const snap = await db().collection(PROPOSALS).orderBy("createdAt", "desc").limit(50).get();
      return snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<ProposalRecord, "id">) }) as ProposalRecord,
      );
    },
    async createProposal(input: CreateProposalInput) {
      const ref = await db()
        .collection(PROPOSALS)
        .add({ ...input, status: "pending", decidedAt: null });
      return ref.id;
    },
    async decide(id: string, status: Exclude<ProposalStatus, "pending">, at: string) {
      // **承認しても params/ は変わらない。** ここが書き換えるのは「人が見た」という記録だけ
      await db().collection(PROPOSALS).doc(id).update({ status, decidedAt: at });
    },
    async appendRunLog(entry: WatchRunLogEntry) {
      await db().collection(RUN_LOG).add(entry);
    },
    async listRunLog(limit: number) {
      const snap = await db().collection(RUN_LOG).orderBy("runAt", "desc").limit(limit).get();
      return snap.docs.map((d) => d.data() as WatchRunLogEntry);
    },
  };
}
