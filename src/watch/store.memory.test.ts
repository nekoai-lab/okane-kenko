import { describe, expect, it } from "vitest";
import type { WizardSelections } from "../wizard/types.js";
import { createMemoryWatchStore } from "./store.memory.js";

const SELECTIONS: WizardSelections = {
  selfBirthYear: 1989,
  selfEmployment: "employee",
  hasSpouse: false,
  childrenBirthYears: [2020],
  educationPlan: "public",
  selfIncome: "lt600",
  assets: "lt500",
  livingCost: "lt30",
  housing: "rent",
  coverageSelf: "unknown",
};

describe("createMemoryWatchStore", () => {
  it("世帯を作成・取得・更新・削除できる", async () => {
    const store = createMemoryWatchStore();
    const id = await store.createHousehold({
      token: "tok-1",
      wizardSelections: SELECTIONS,
      lastDiagnosis: {
        headlineKind: "shortage",
        paramVersion: "2026.08",
        diagnosedAt: "2026-09-14T00:00:00.000Z",
      },
      consentedAt: "2026-09-14T00:00:00.000Z",
    });

    const found = await store.findByToken("tok-1");
    expect(found?.id).toBe(id);
    expect(found?.lastCheckedAt).toBe("2026-09-14T00:00:00.000Z");

    await store.updateCheckedAt(id, "2026-09-21T00:00:00.000Z");
    await store.updateNotifiedAt(id, "2026-09-21T00:00:00.000Z");
    const updated = await store.findByToken("tok-1");
    expect(updated?.lastCheckedAt).toBe("2026-09-21T00:00:00.000Z");
    expect(updated?.lastNotifiedAt).toBe("2026-09-21T00:00:00.000Z");

    await store.appendLog({
      runAt: "2026-09-21T00:00:00.000Z",
      householdId: id,
      triggerType: "age_milestone",
      triggerDetail: "テスト",
      decision: "notified",
    });
    expect(store.logs).toHaveLength(1);

    await store.deleteHousehold(id);
    expect(await store.findByToken("tok-1")).toBeNull();
  });

  it("該当トークンが無ければ null を返す", async () => {
    const store = createMemoryWatchStore();
    expect(await store.findByToken("missing")).toBeNull();
  });
});
