import { describe, expect, it, vi } from "vitest";
import { loadParams } from "../params/index.js";
import type { WizardSelections } from "../wizard/types.js";
import { runWatch } from "./run.js";
import { createMemoryWatchStore } from "./store.memory.js";

const P = loadParams("2026-08");

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

async function seedHousehold(
  store: ReturnType<typeof createMemoryWatchStore>,
  token: string,
  childrenBirthYears: number[],
  checkedAt: string,
) {
  const id = await store.createHousehold({
    token,
    wizardSelections: { ...SELECTIONS, childrenBirthYears },
    lastDiagnosis: {
      headlineKind: "shortage",
      paramVersion: P.version,
      diagnosedAt: checkedAt,
    },
    consentedAt: checkedAt,
  });
  await store.updateCheckedAt(id, checkedAt);
  return id;
}

describe("runWatch", () => {
  it("節目を越えた世帯にSlack通知し、notifiedAtとログを記録する", async () => {
    const store = createMemoryWatchStore();
    const id = await seedHousehold(store, "tok-1", [2020], "2025-12-01T00:00:00.000Z");
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));

    const result = await runWatch({
      store,
      params: P,
      now: new Date("2026-06-01T00:00:00+09:00"),
      webhookUrl: "https://hooks.slack.test/abc",
      baseUrl: "https://example.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ checked: 1, notified: 1, errors: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const household = await store.findByToken("tok-1");
    expect(household?.lastNotifiedAt).not.toBeNull();
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]).toMatchObject({ householdId: id, decision: "notified" });
  });

  it("変化がなければ通知せず、silentとしてログだけ残す", async () => {
    const store = createMemoryWatchStore();
    await seedHousehold(store, "tok-1", [2020], "2026-06-01T00:00:00.000Z");
    const fetchImpl = vi.fn();

    const result = await runWatch({
      store,
      params: P,
      now: new Date("2026-06-08T00:00:00+09:00"),
      webhookUrl: "https://hooks.slack.test/abc",
      baseUrl: "https://example.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ checked: 1, notified: 0, errors: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.logs[0]).toMatchObject({ decision: "silent" });
  });

  it("Slack投稿が2回とも失敗したら failed として記録し、次回に持ち越さない", async () => {
    const store = createMemoryWatchStore();
    await seedHousehold(store, "tok-1", [2020], "2025-12-01T00:00:00.000Z");
    const fetchImpl = vi.fn(async () => new Response("down", { status: 500 }));

    const now = new Date("2026-06-01T00:00:00+09:00");
    const result = await runWatch({
      store,
      params: P,
      now,
      webhookUrl: "https://hooks.slack.test/abc",
      baseUrl: "https://example.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ checked: 1, notified: 0, errors: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 1回リトライ
    const household = await store.findByToken("tok-1");
    expect(household?.lastNotifiedAt).toBeNull();
    expect(household?.lastCheckedAt).toBe(now.toISOString());
    expect(store.logs[0]).toMatchObject({ decision: "failed" });
  });

  it("1件の世帯でエラーが起きても他の世帯の処理は続ける", async () => {
    const store = createMemoryWatchStore();
    const brokenId = await seedHousehold(store, "tok-1", [2020], "2025-12-01T00:00:00.000Z");
    const okId = await seedHousehold(store, "tok-2", [2011], "2026-01-01T00:00:00.000Z");

    const wrappedStore = {
      ...store,
      appendLog: vi.fn(async (entry) => {
        if (entry.householdId === brokenId) throw new Error("ログ書き込み失敗");
        store.logs.push(entry);
      }),
    };

    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const result = await runWatch({
      store: wrappedStore,
      params: P,
      now: new Date("2026-06-01T00:00:00+09:00"),
      webhookUrl: "https://hooks.slack.test/abc",
      baseUrl: "https://example.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.checked).toBe(2);
    expect(result.errors).toEqual([{ householdId: brokenId, message: "ログ書き込み失敗" }]);
    expect(store.logs.some((l) => l.householdId === okId)).toBe(true);
  });
});
