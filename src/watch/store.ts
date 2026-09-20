/**
 * 気づき通知が保存する世帯のスナップショットと、実行ログの型・保存先インターフェース。
 *
 * Phase A(DBなし)を初めて崩す層(2026-09-14 設計)。保存するのはレンジ値の入力
 * (WizardSelections)と結果の要点のみで、実額・氏名は持たない。実装(Firestore)は
 * テストから切り離すため、ここはインターフェースだけを置く。テストは
 * createMemoryWatchStore(store.memory.ts)を使う。
 */
import type { HouseholdHeadline } from "../calc/index.js";
import type { WizardSelections } from "../wizard/types.js";

export interface HouseholdRecord {
  id: string;
  /** マジックリンク用の固有トークン。知っていれば開ける(現行の本番URLと同じ信頼モデル) */
  token: string;
  wizardSelections: WizardSelections;
  lastDiagnosis: {
    headlineKind: HouseholdHeadline["kind"];
    paramVersion: string;
    diagnosedAt: string;
  };
  /** 同意画面で保存を選んだ日時(ISO文字列) */
  consentedAt: string;
  /** ウォッチャーが最後に確認した日時(ISO文字列) */
  lastCheckedAt: string;
  /** 最後に通知した日時(ISO文字列)。未通知なら null */
  lastNotifiedAt: string | null;
}

export type NoticeDecision = "notified" | "silent" | "failed";

export interface NoticeLogEntry {
  runAt: string;
  householdId: string;
  triggerType: "age_milestone";
  triggerDetail: string;
  decision: NoticeDecision;
}

export interface CreateHouseholdInput {
  token: string;
  wizardSelections: WizardSelections;
  lastDiagnosis: HouseholdRecord["lastDiagnosis"];
  consentedAt: string;
}

export interface WatchStore {
  listHouseholds(): Promise<HouseholdRecord[]>;
  findByToken(token: string): Promise<HouseholdRecord | null>;
  createHousehold(input: CreateHouseholdInput): Promise<string>;
  updateCheckedAt(id: string, checkedAt: string): Promise<void>;
  updateNotifiedAt(id: string, notifiedAt: string): Promise<void>;
  deleteHousehold(id: string): Promise<void>;
  appendLog(entry: NoticeLogEntry): Promise<void>;
}
