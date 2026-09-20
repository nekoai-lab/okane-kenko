/**
 * WatchStore の Firestore 実装。
 *
 * 認証は Cloud Run の Application Default Credentials に委ねる(鍵をコードやenvに置かない)。
 * ローカル動作確認では `gcloud auth application-default login` で取得した認証情報を使う。
 * ここは意図的にユニットテストを持たない(Task 5の説明を参照)。
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { CreateHouseholdInput, HouseholdRecord, NoticeLogEntry, WatchStore } from "./store.js";

const HOUSEHOLDS = "households";
const NOTICE_LOG = "notice_log";

function db() {
  if (getApps().length === 0) initializeApp();
  return getFirestore();
}

export function createFirestoreWatchStore(): WatchStore {
  return {
    async listHouseholds() {
      const snap = await db().collection(HOUSEHOLDS).get();
      return snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<HouseholdRecord, "id">) }) as HouseholdRecord,
      );
    },
    async findByToken(token: string) {
      const snap = await db().collection(HOUSEHOLDS).where("token", "==", token).limit(1).get();
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { id: d.id, ...(d.data() as Omit<HouseholdRecord, "id">) } as HouseholdRecord;
    },
    async createHousehold(input: CreateHouseholdInput) {
      const ref = await db().collection(HOUSEHOLDS).add({
        token: input.token,
        wizardSelections: input.wizardSelections,
        lastDiagnosis: input.lastDiagnosis,
        consentedAt: input.consentedAt,
        lastCheckedAt: input.consentedAt,
        lastNotifiedAt: null,
      });
      return ref.id;
    },
    async updateCheckedAt(id: string, checkedAt: string) {
      await db().collection(HOUSEHOLDS).doc(id).update({ lastCheckedAt: checkedAt });
    },
    async updateNotifiedAt(id: string, notifiedAt: string) {
      await db().collection(HOUSEHOLDS).doc(id).update({ lastNotifiedAt: notifiedAt });
    },
    async deleteHousehold(id: string) {
      await db().collection(HOUSEHOLDS).doc(id).delete();
    },
    async appendLog(entry: NoticeLogEntry) {
      await db().collection(NOTICE_LOG).add(entry);
    },
  };
}
