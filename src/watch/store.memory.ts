/**
 * WatchStore のメモリ実装(テスト・ローカル動作確認用)。Firestore を要求しない。
 */
import { randomUUID } from "node:crypto";
import type { CreateHouseholdInput, HouseholdRecord, NoticeLogEntry, WatchStore } from "./store.js";

export function createMemoryWatchStore(): WatchStore & { logs: NoticeLogEntry[] } {
  const households = new Map<string, HouseholdRecord>();
  const logs: NoticeLogEntry[] = [];

  return {
    logs,
    async listHouseholds() {
      return [...households.values()];
    },
    async findByToken(token) {
      return [...households.values()].find((h) => h.token === token) ?? null;
    },
    async createHousehold(input: CreateHouseholdInput) {
      const id = randomUUID();
      households.set(id, {
        id,
        token: input.token,
        wizardSelections: input.wizardSelections,
        lastDiagnosis: input.lastDiagnosis,
        consentedAt: input.consentedAt,
        lastCheckedAt: input.consentedAt,
        lastNotifiedAt: null,
      });
      return id;
    },
    async updateCheckedAt(id, checkedAt) {
      const h = households.get(id);
      if (h) h.lastCheckedAt = checkedAt;
    },
    async updateNotifiedAt(id, notifiedAt) {
      const h = households.get(id);
      if (h) h.lastNotifiedAt = notifiedAt;
    },
    async deleteHousehold(id) {
      households.delete(id);
    },
    async appendLog(entry) {
      logs.push(entry);
    },
  };
}
