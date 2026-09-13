# 気づき通知(継続的な見直し) フェーズ2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 世帯側のトリガー(子の学齢の節目到達)だけで、観察→判断→行動→記録の通知ループを一通り動かす。Slackへの気づき通知→着地画面→本人の選択で `/result` へ、という二段階同意のUXを含む。

**Architecture:** 既存のNext.js/TypeScriptアプリ内に `src/watch/` を新設し、Cloud Schedulerが叩く1本のAPIルート(`/api/watch/run`)から決定的なロジック(AI不使用)で世帯を巡回する。保存先はFirestore(新規)。既存の算定エンジン・ガードレール・narrateは無改造で再利用する。

**Tech Stack:** Next.js 15 (App Router) / TypeScript / vitest / firebase-admin(Firestore) / Slack Incoming Webhook

## Global Constraints

- TypeScript strict。`any` を使わない
- 算定エンジン(`src/calc/**`)は変更しない。金額は`src/calc`でしか作らない
- 制度パラメータ(学齢の節目年齢を含む)をコードにハードコードしない。`params/*.yaml` 由来の`ParamSet`から取る
- AIに新しく副作用を持たせない・数値を生成させない(本フェーズは通知文言が固定テンプレートのためAI自体を呼ばない)
- 秘密情報(`SLACK_WEBHOOK_URL` / `WATCH_CRON_SECRET`)は環境変数から読み、コードに直書きしない。`.env.example`には名前・用途・取得先のみ記す
- import は既存コード同様、拡張子`.js`を付けたESM形式にする(`"type": "module"`)
- 各タスックのコミット後、`npm run format` (自動・PostToolUseフックで既に走る)・`npm run lint`・`npm run typecheck`・`npm test` が通ることを確認する(pre-commitフックでも強制される)
- **`docs/ADR.md` と `docs/CONTEXT.md` は、本プランのタスクでは編集しない**(CLAUDE.mdの規定により人間確認が要るため。別途提示する)

---

## Task 1: 子の学齢の節目判定(純粋関数)

**Files:**
- Create: `src/watch/milestones.ts`
- Test: `src/watch/milestones.test.ts`

**Interfaces:**
- Consumes: `ParamSet`(`src/params/index.ts`で既存定義。特に`p.education.stages.{kinder,primary,junior,high}.fromAge`と`p.education.university.{fromAge,toAge}`)
- Produces: `milestoneAges(p: ParamSet): number[]` / `ageAsOf(birthYear: number, asOf: Date): number` / `crossedMilestones(p: ParamSet, childrenBirthYears: number[], lastCheckedAt: Date, now: Date): MilestoneCrossing[]` / `interface MilestoneCrossing { birthYear: number; age: number }`(以後のタスクが使う)

- [ ] **Step 1: 失敗するテストを書く**

`src/watch/milestones.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { loadParams } from "../params/index.js";
import { ageAsOf, crossedMilestones, milestoneAges } from "./milestones.js";

const P = loadParams("2026-08");

describe("milestoneAges：学齢の節目年齢", () => {
  it("params の教育費段階から節目年齢を導く", () => {
    expect(milestoneAges(P)).toEqual([3, 6, 12, 15, 18, 22]);
  });
});

describe("ageAsOf：基準日時点の年齢", () => {
  it("年単位で年齢を出す(normalizeと同じ簡略化)", () => {
    expect(ageAsOf(2020, new Date("2026-01-01T00:00:00+09:00"))).toBe(6);
  });
});

describe("crossedMilestones：節目到達の判定", () => {
  const LAST = new Date("2025-12-01T00:00:00+09:00"); // asOfYear = 2025
  const NOW = new Date("2026-06-01T00:00:00+09:00"); // asOfYear = 2026

  it("前回チェック時は5歳・今回は6歳なら、小学校の節目(6)を検知する", () => {
    const result = crossedMilestones(P, [2020], LAST, NOW);
    expect(result).toEqual([{ birthYear: 2020, age: 6 }]);
  });

  it("節目をまたいでいなければ何も検知しない", () => {
    const result = crossedMilestones(P, [2020], NOW, NOW);
    expect(result).toEqual([]);
  });

  it("複数の子がいれば、それぞれ独立に判定する", () => {
    const result = crossedMilestones(P, [2020, 2011], LAST, NOW);
    // 2020年生まれ: 2025年5歳→2026年6歳(節目)。2011年生まれ: 2025年14歳→2026年15歳(節目)
    expect(result).toEqual([
      { birthYear: 2020, age: 6 },
      { birthYear: 2011, age: 15 },
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/watch/milestones.test.ts`
Expected: FAIL(`src/watch/milestones.ts` が存在しない)

- [ ] **Step 3: 実装する**

`src/watch/milestones.ts`:
```ts
/**
 * 子の学齢の節目到達を判定する(気づき通知フェーズ2aのトリガー)。
 *
 * 節目の年齢は params の教育費段階(src/params/index.ts の EducationParams)から取る。
 * コードに年齢をハードコードしない(CLAUDE.mdの制度パラメータの扱い)。
 * 年齢は「基準年 − 生年」(normalize.ts と同じ年単位の簡略化。日付までは持たない)。
 */
import type { ParamSet } from "../params/index.js";

/** 学齢の節目となる年齢の一覧(幼稚園・小学校・中学校・高校・大学・独立) */
export function milestoneAges(p: ParamSet): number[] {
  const s = p.education.stages;
  return [
    s.kinder.fromAge,
    s.primary.fromAge,
    s.junior.fromAge,
    s.high.fromAge,
    p.education.university.fromAge,
    p.education.university.toAge + 1,
  ];
}

export function ageAsOf(birthYear: number, asOf: Date): number {
  return asOf.getFullYear() - birthYear;
}

export interface MilestoneCrossing {
  /** 節目に到達した子の生年 */
  birthYear: number;
  /** 到達した節目の年齢 */
  age: number;
}

/**
 * 世帯の子どもたちについて、`lastCheckedAt` から `now` の間に学齢の節目を
 * 越えた子を検知する。
 */
export function crossedMilestones(
  p: ParamSet,
  childrenBirthYears: number[],
  lastCheckedAt: Date,
  now: Date,
): MilestoneCrossing[] {
  const ages = milestoneAges(p);
  const crossings: MilestoneCrossing[] = [];
  for (const birthYear of childrenBirthYears) {
    const before = ageAsOf(birthYear, lastCheckedAt);
    const after = ageAsOf(birthYear, now);
    for (const age of ages) {
      if (before < age && after >= age) {
        crossings.push({ birthYear, age });
      }
    }
  }
  return crossings;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/watch/milestones.test.ts`
Expected: PASS(4 tests)

- [ ] **Step 5: コミット**

```bash
git add src/watch/milestones.ts src/watch/milestones.test.ts
git commit -m "feat(T-13): 子の学齢の節目到達を判定する純粋関数を追加"
```

---

## Task 2: Watchストアの型・インターフェース・メモリ実装

**Files:**
- Create: `src/watch/store.ts`
- Create: `src/watch/store.memory.ts`
- Test: `src/watch/store.memory.test.ts`

**Interfaces:**
- Consumes: `HouseholdHeadline`(`src/calc/index.ts`)、`WizardSelections`(`src/wizard/types.ts`)
- Produces: `interface HouseholdRecord`, `type NoticeDecision`, `interface NoticeLogEntry`, `interface CreateHouseholdInput`, `interface WatchStore`(`src/watch/store.ts`) / `createMemoryWatchStore(): WatchStore & { logs: NoticeLogEntry[] }`(`src/watch/store.memory.ts`)。以後の全タスクがこれらの型・関数名をそのまま使う

- [ ] **Step 1: 型とインターフェースを書く(このタスクにテストは無い。純粋な型定義のため)**

`src/watch/store.ts`:
```ts
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
```

`src/watch/store.memory.ts`:
```ts
/**
 * WatchStore のメモリ実装(テスト・ローカル動作確認用)。Firestore を要求しない。
 */
import { randomUUID } from "node:crypto";
import type {
  CreateHouseholdInput,
  HouseholdRecord,
  NoticeLogEntry,
  WatchStore,
} from "./store.js";

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
```

- [ ] **Step 2: メモリ実装のテストを書く**

`src/watch/store.memory.test.ts`:
```ts
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
```

- [ ] **Step 3: テストが通ることを確認する**

Run: `npx vitest run src/watch/store.memory.test.ts`
Expected: PASS(2 tests)

- [ ] **Step 4: コミット**

```bash
git add src/watch/store.ts src/watch/store.memory.ts src/watch/store.memory.test.ts
git commit -m "feat(T-13): Watchストアの型とメモリ実装を追加"
```

---

## Task 3: Slack通知(Incoming Webhook)

**Files:**
- Create: `src/watch/slack.ts`
- Test: `src/watch/slack.test.ts`

**Interfaces:**
- Consumes: なし(標準の`fetch`。テストでは`fetchImpl`を注入)
- Produces: `interface SlackNoticeOptions { webhookUrl: string; message: string; noticeUrl: string; fetchImpl?: typeof fetch }` / `postNoticeToSlack(o: SlackNoticeOptions): Promise<void>`(Task 4が使う)

- [ ] **Step 1: 失敗するテストを書く**

`src/watch/slack.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { postNoticeToSlack } from "./slack.js";

describe("postNoticeToSlack", () => {
  it("Webhook URL へ text 付きの JSON を POST する", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    await postNoticeToSlack({
      webhookUrl: "https://hooks.slack.test/abc",
      message: "お子さんが6歳になりました。",
      noticeUrl: "https://example.test/notice/tok-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.slack.test/abc");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe(
      "お子さんが6歳になりました。\nhttps://example.test/notice/tok-1",
    );
  });

  it("HTTPエラーなら例外を投げる", async () => {
    const fetchImpl = vi.fn(async () => new Response("invalid_payload", { status: 400 }));
    await expect(
      postNoticeToSlack({
        webhookUrl: "https://hooks.slack.test/abc",
        message: "テスト",
        noticeUrl: "https://example.test/notice/tok-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Slack通知に失敗しました/);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/watch/slack.test.ts`
Expected: FAIL(`src/watch/slack.ts` が存在しない)

- [ ] **Step 3: 実装する**

`src/watch/slack.ts`:
```ts
/**
 * Slack Incoming Webhook への通知投稿。
 *
 * 二段階同意の第一段階(CLAUDE.md「不安を煽らない」の延長)：ここでは金額を一切含めない。
 * AIは使わない(固定テンプレート文言のみで、生成の必要がないため)。
 */
export interface SlackNoticeOptions {
  webhookUrl: string;
  /** きっかけの文言(数字なし) */
  message: string;
  /** クリック後にたどり着くマジックリンク */
  noticeUrl: string;
  /** テスト用に差し替える(既定はグローバルの fetch) */
  fetchImpl?: typeof fetch;
}

export async function postNoticeToSlack(o: SlackNoticeOptions): Promise<void> {
  const doFetch = o.fetchImpl ?? fetch;
  const res = await doFetch(o.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `${o.message}\n${o.noticeUrl}` }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Slack通知に失敗しました: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/watch/slack.test.ts`
Expected: PASS(2 tests)

- [ ] **Step 5: コミット**

```bash
git add src/watch/slack.ts src/watch/slack.test.ts
git commit -m "feat(T-13): Slack Incoming Webhookへの通知投稿を追加"
```

---

## Task 4: ウォッチャー本体(観察→判断→行動→記録)

**Files:**
- Create: `src/watch/run.ts`
- Test: `src/watch/run.test.ts`

**Interfaces:**
- Consumes: `crossedMilestones`(Task 1・`./milestones.js`) / `postNoticeToSlack`(Task 3・`./slack.js`) / `HouseholdRecord, NoticeDecision, WatchStore`(Task 2・`./store.js`) / `ParamSet`(`../params/index.js`)
- Produces: `interface WatchRunOptions { store: WatchStore; params: ParamSet; now: Date; webhookUrl: string; baseUrl: string; fetchImpl?: typeof fetch }` / `interface WatchRunResult { checked: number; notified: number; errors: Array<{ householdId: string; message: string }> }` / `runWatch(opts: WatchRunOptions): Promise<WatchRunResult>`(Task 6が使う)

- [ ] **Step 1: 失敗するテストを書く**

`src/watch/run.test.ts`:
```ts
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
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/watch/run.test.ts`
Expected: FAIL(`src/watch/run.ts` が存在しない)

- [ ] **Step 3: 実装する**

`src/watch/run.ts`:
```ts
/**
 * 気づき通知の観察→判断→行動→記録ループ(フェーズ2a・世帯側トリガーのみ)。
 *
 * 決定的なロジックのみ(AIは使わない)。判断結果は notice_log に必ず記録する
 * ── 通知しなかった実行(silent)も残す。「沈黙も設計のうち」を後から示せるようにするため。
 */
import type { ParamSet } from "../params/index.js";
import { crossedMilestones } from "./milestones.js";
import { postNoticeToSlack } from "./slack.js";
import type { HouseholdRecord, NoticeDecision, WatchStore } from "./store.js";

export interface WatchRunOptions {
  store: WatchStore;
  params: ParamSet;
  now: Date;
  webhookUrl: string;
  /** Slack通知のリンク先を組み立てる基底URL(例: https://okane-kenko-xxx.a.run.app) */
  baseUrl: string;
  /** テスト用に差し替える(既定はグローバルの fetch) */
  fetchImpl?: typeof fetch;
}

export interface WatchRunResult {
  checked: number;
  notified: number;
  errors: Array<{ householdId: string; message: string }>;
}

function describeCrossing(age: number): string {
  return `お子さんが${age}歳になりました。前回の診断からの変化を確認できます。`;
}

async function postWithRetry(
  webhookUrl: string,
  message: string,
  noticeUrl: string,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await postNoticeToSlack({ webhookUrl, message, noticeUrl, fetchImpl });
      return true;
    } catch {
      if (attempt === 1) return false;
    }
  }
  return false;
}

async function processHousehold(
  h: HouseholdRecord,
  opts: WatchRunOptions,
): Promise<{ notified: boolean }> {
  const crossings = crossedMilestones(
    opts.params,
    h.wizardSelections.childrenBirthYears,
    new Date(h.lastCheckedAt),
    opts.now,
  );

  let notified = false;
  if (crossings.length > 0) {
    const message = describeCrossing(crossings[0].age);
    const noticeUrl = `${opts.baseUrl}/notice/${h.token}`;
    const sent = await postWithRetry(opts.webhookUrl, message, noticeUrl, opts.fetchImpl);
    const decision: NoticeDecision = sent ? "notified" : "failed";
    if (sent) {
      await opts.store.updateNotifiedAt(h.id, opts.now.toISOString());
      notified = true;
    }
    await opts.store.appendLog({
      runAt: opts.now.toISOString(),
      householdId: h.id,
      triggerType: "age_milestone",
      triggerDetail: message,
      decision,
    });
  } else {
    await opts.store.appendLog({
      runAt: opts.now.toISOString(),
      householdId: h.id,
      triggerType: "age_milestone",
      triggerDetail: "変化なし",
      decision: "silent",
    });
  }

  await opts.store.updateCheckedAt(h.id, opts.now.toISOString());
  return { notified };
}

export async function runWatch(opts: WatchRunOptions): Promise<WatchRunResult> {
  const households = await opts.store.listHouseholds();
  const result: WatchRunResult = { checked: 0, notified: 0, errors: [] };

  for (const h of households) {
    result.checked += 1;
    try {
      const { notified } = await processHousehold(h, opts);
      if (notified) result.notified += 1;
    } catch (e) {
      result.errors.push({
        householdId: h.id,
        message: e instanceof Error ? e.message : "不明なエラー",
      });
    }
  }

  return result;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/watch/run.test.ts`
Expected: PASS(4 tests)

- [ ] **Step 5: コミット**

```bash
git add src/watch/run.ts src/watch/run.test.ts
git commit -m "feat(T-13): 観察→判断→行動→記録のウォッチャー本体を追加"
```

---

## Task 5: Firestore実装

**Files:**
- Create: `src/watch/store.firestore.ts`
- Modify: `package.json`(依存追加)

**Interfaces:**
- Consumes: `WatchStore, HouseholdRecord, NoticeLogEntry, CreateHouseholdInput`(Task 2・`./store.js`)
- Produces: `createFirestoreWatchStore(): WatchStore`(Task 6・7・9が使う)

**このタスクはユニットテストを持たない。** 実際のFirestore書き込み確認は Task 11(デプロイ環境 or ローカルの実Firestoreに対する手動確認)で行う方針(`narrate.ts`の実LLM呼び出しと同じ扱い。設計書§8)。

- [ ] **Step 1: 依存を追加する**

Run: `npm install firebase-admin`
Expected: `package.json` の `dependencies` に `firebase-admin` が追加される

- [ ] **Step 2: 実装する**

`src/watch/store.firestore.ts`:
```ts
/**
 * WatchStore の Firestore 実装。
 *
 * 認証は Cloud Run の Application Default Credentials に委ねる(鍵をコードやenvに置かない)。
 * ローカル動作確認では `gcloud auth application-default login` で取得した認証情報を使う。
 * ここは意図的にユニットテストを持たない(Task 5の説明を参照)。
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type {
  CreateHouseholdInput,
  HouseholdRecord,
  NoticeLogEntry,
  WatchStore,
} from "./store.js";

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
      const ref = await db()
        .collection(HOUSEHOLDS)
        .add({
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
```

- [ ] **Step 3: 型検査が通ることを確認する**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add package.json package-lock.json src/watch/store.firestore.ts
git commit -m "feat(T-13): Firestoreを使ったWatchStore実装を追加"
```

---

## Task 6: スケジューラ用APIルート `POST /api/watch/run`

**Files:**
- Create: `app/api/watch/run/route.ts`

**Interfaces:**
- Consumes: `runWatch`(Task 4)、`createFirestoreWatchStore`(Task 5)、`loadParams`(`src/params/index.ts`)
- Produces: HTTPエンドポイント(Task 11の手動確認が叩く)

**このタスクは自動テストを持たない**(既存の`app/api/diagnose/route.ts`もルート本体は未テストで、E2E/手動確認に委ねる方針を踏襲する)。

- [ ] **Step 1: 実装する**

`app/api/watch/run/route.ts`:
```ts
/**
 * POST /api/watch/run ─ 気づき通知の定期実行(Cloud Schedulerから叩く)
 *
 * 認証は共有シークレット(X-Watch-Secretヘッダ)。Cloud RunのIAM invokerはサービス全体に
 * かかるため、同一アプリ内の1ルートだけを守るにはこの方式が最も簡単(OIDC検証より軽い)。
 * 破壊的な操作はしない(Slack投稿のみ)ため、この強度で十分と判断した。
 */
import { NextResponse } from "next/server";
import { loadParams } from "../../../../src/params/index.js";
import { runWatch } from "../../../../src/watch/run.js";
import { createFirestoreWatchStore } from "../../../../src/watch/store.firestore.js";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-watch-secret");
  const expected = process.env.WATCH_CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const baseUrl = process.env.WATCH_BASE_URL;
  if (!webhookUrl || !baseUrl) {
    return NextResponse.json(
      {
        error: "misconfigured",
        message: "SLACK_WEBHOOK_URL または WATCH_BASE_URL が未設定です。",
      },
      { status: 500 },
    );
  }

  try {
    const params = loadParams();
    const result = await runWatch({
      store: createFirestoreWatchStore(),
      params,
      now: new Date(),
      webhookUrl,
      baseUrl,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "実行できませんでした。";
    return NextResponse.json({ error: "watch_run_failed", message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 型検査が通ることを確認する**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add app/api/watch/run/route.ts
git commit -m "feat(T-13): Cloud Scheduler用の /api/watch/run を追加"
```

---

## Task 7: 同意API `POST /api/watch/consent`

**Files:**
- Create: `app/api/watch/consent/schema.ts`
- Create: `app/api/watch/consent/route.ts`
- Test: `app/api/watch/consent/schema.test.ts`

**Interfaces:**
- Consumes: `decodeSelections`(`src/wizard/url.ts`)、`toCompleteSelections`(`src/wizard/complete.ts`)、`normalize`(`src/wizard/normalize.ts`)、`diagnose`(`src/calc/index.ts`)、`loadParams`(`src/params/index.ts`)、`createFirestoreWatchStore`(Task 5)
- Produces: `ConsentRequestSchema`(zod) / HTTPエンドポイント(Task 8のUIが呼ぶ)。レスポンス`{ token: string }`

- [ ] **Step 1: スキーマの失敗するテストを書く**

`app/api/watch/consent/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ConsentRequestSchema } from "./schema.js";

describe("ConsentRequestSchema", () => {
  it("query文字列を受け付ける", () => {
    const parsed = ConsentRequestSchema.safeParse({ query: "v=1&sb=1989" });
    expect(parsed.success).toBe(true);
  });

  it("空文字列は拒否する", () => {
    const parsed = ConsentRequestSchema.safeParse({ query: "" });
    expect(parsed.success).toBe(false);
  });

  it("queryが無ければ拒否する", () => {
    const parsed = ConsentRequestSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run app/api/watch/consent/schema.test.ts`
Expected: FAIL(`schema.ts` が存在しない)

- [ ] **Step 3: スキーマとルートを実装する**

`app/api/watch/consent/schema.ts`:
```ts
/**
 * POST /api/watch/consent のリクエスト検証。
 *
 * /result と同じ区分コード(URLクエリ文字列)をそのまま受け取り、サーバ側で
 * decodeSelections → toCompleteSelections → normalize → diagnose を通す。
 */
import { z } from "zod";

export const ConsentRequestSchema = z.object({
  query: z.string().min(1),
});

export type ConsentRequest = z.infer<typeof ConsentRequestSchema>;
```

`app/api/watch/consent/route.ts`:
```ts
/**
 * POST /api/watch/consent ─ 診断結果を保存し、気づき通知を受け取る同意を記録する(T-13)
 *
 * 責務は「/result と同じ入力から再診断し、世帯のスナップショットを保存する」だけ。
 * 金額の生成はしない(diagnose の結果をそのまま使う)。同意なしに黙って保存しない
 * (この呼び出し自体が、独立した確認画面での明示的な選択から来る)。
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { diagnose } from "../../../../src/calc/index.js";
import { loadParams } from "../../../../src/params/index.js";
import { toCompleteSelections } from "../../../../src/wizard/complete.js";
import { normalize } from "../../../../src/wizard/normalize.js";
import { decodeSelections } from "../../../../src/wizard/url.js";
import { createFirestoreWatchStore } from "../../../../src/watch/store.firestore.js";
import { ConsentRequestSchema } from "./schema.js";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "リクエストボディを JSON として解釈できません。" },
      { status: 400 },
    );
  }

  const parsed = ConsentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const partial = decodeSelections(parsed.data.query);
  const complete = toCompleteSelections(partial);
  if (!complete) {
    return NextResponse.json(
      { error: "incomplete_selections", message: "入力がまだ足りていないようです。" },
      { status: 400 },
    );
  }

  try {
    const params = loadParams();
    const asOf = new Date();
    const { input } = normalize(params, complete, asOf);
    const diagnosis = diagnose(params, input, asOf);

    const token = randomUUID();
    const consentedAt = asOf.toISOString();
    const store = createFirestoreWatchStore();
    await store.createHousehold({
      token,
      wizardSelections: complete,
      lastDiagnosis: {
        headlineKind: diagnosis.householdHeadline.kind,
        paramVersion: diagnosis.paramVersion,
        diagnosedAt: consentedAt,
      },
      consentedAt,
    });

    return NextResponse.json({ token });
  } catch (e) {
    const message = e instanceof Error ? e.message : "保存できませんでした。";
    return NextResponse.json({ error: "consent_failed", message }, { status: 503 });
  }
}
```

- [ ] **Step 4: スキーマのテストが通ることを確認する**

Run: `npx vitest run app/api/watch/consent/schema.test.ts`
Expected: PASS(3 tests)

- [ ] **Step 5: コミット**

```bash
git add app/api/watch/consent/schema.ts app/api/watch/consent/schema.test.ts app/api/watch/consent/route.ts
git commit -m "feat(T-13): 診断結果の保存に同意するAPIを追加"
```

---

## Task 8: 初回保存の同意画面(UI案2・独立した確認画面)

**Files:**
- Create: `app/save/page.tsx`
- Create: `app/save/SaveConsent.tsx`
- Create: `app/save/page.module.css`
- Modify: `app/result/page.tsx:679-684`(「保存する」リンクを追加)

**Interfaces:**
- Consumes: `decodeSelections`(`src/wizard/url.ts`)、`toCompleteSelections`(`src/wizard/complete.ts`)、`POST /api/watch/consent`(Task 7)
- Produces: `/save`ページ(ブラウザで確認する)

- [ ] **Step 1: 同意画面を実装する**

`app/save/page.tsx`:
```tsx
/**
 * 初回保存の同意画面(UI案2・独立した確認画面)。
 *
 * /result と同じ区分コードを URL から受け取り、入力が完全かどうかだけ確認する。
 * 金額の再計算はここではしない(保存の可否だけを判断する画面のため)。
 */
import Link from "next/link";
import { toCompleteSelections } from "../../src/wizard/complete.js";
import { decodeSelections } from "../../src/wizard/url.js";
import { SaveConsent } from "./SaveConsent.js";
import s from "./page.module.css";

export default async function SavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(sp)) {
    if (typeof val === "string") q.set(k, val);
  }

  const complete = toCompleteSelections(decodeSelections(q));
  if (!complete) {
    return (
      <main className={s.page}>
        <p>この結果を保存できませんでした。診断からやり直してください。</p>
        <Link className={s.link} href="/wizard">
          診断をはじめからやり直す
        </Link>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <h1 className={s.title}>この結果を保存しますか？</h1>
      <p className={s.body}>
        保存すると、お子さんの成長など状況が変わったときにSlackで一言お知らせできます。
        保存する内容は今日の入力(レンジ値)と結果の要点だけです。金額の詳細は毎回お知らせせず、
        見に来たときだけ出します。いつでも削除できます。
      </p>
      <SaveConsent query={q.toString()} />
    </main>
  );
}
```

`app/save/SaveConsent.tsx`:
```tsx
"use client";

/**
 * 保存する／しないの選択(UI案2)。保存はオプトイン(既定は非保存)。
 */
import { useState } from "react";
import s from "./page.module.css";

export function SaveConsent({ query }: { query: string }) {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setStatus("saving");
    try {
      const res = await fetch("/api/watch/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as { token?: string; message?: string };
      if (!res.ok || !data.token) {
        setStatus("error");
        setMessage(data.message ?? "保存できませんでした。");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("通信に失敗しました。時間をおいて試してください。");
    }
  }

  if (status === "done") {
    return <p className={s.done}>保存しました。状況が変わったらSlackでお知らせします。</p>;
  }

  return (
    <div>
      <button
        type="button"
        className={s.primaryButton}
        onClick={handleSave}
        disabled={status === "saving"}
      >
        {status === "saving" ? "保存しています…" : "保存してお知らせを受け取る"}
      </button>
      <a className={s.secondaryButton} href="/">
        保存しない
      </a>
      {status === "error" && <p className={s.error}>{message}</p>}
    </div>
  );
}
```

`app/save/page.module.css`:
```css
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 48px 20px;
  color: var(--color-text);
}

.title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
  text-align: center;
}

.body {
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin-bottom: 24px;
}

.primaryButton {
  display: block;
  width: 100%;
  padding: 14px;
  margin-bottom: 12px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary);
  color: var(--color-text-on-inverse);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.primaryButton:disabled {
  background: var(--color-primary-disabled);
  cursor: default;
}

.secondaryButton {
  display: block;
  width: 100%;
  padding: 14px;
  text-align: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-secondary);
  text-decoration: none;
}

.done {
  color: var(--color-success-text);
  font-weight: 700;
}

.error {
  color: var(--color-error-text);
  margin-top: 12px;
}

.link {
  color: var(--color-link);
}
```

- [ ] **Step 2: `/result` に「保存する」リンクを追加する**

`app/result/page.tsx:679-684` を以下のように変更する(`s.section`・`s.link`・`Link`・`q`は同ファイル内で既に定義・importされているものをそのまま使う)。

変更前:
```tsx
      <p className={s.sources}>
        出典：遺族年金は日本年金機構・厚生年金保険法（令和8年度の年金額は報道値ベースで確定前）、教育費は文部科学省
        子供の学習費調査。生活費率・就労推定などの「当社基準」は公的出典のない当社の見立てです。
      </p>

      <div className={s.draftNote}>
```

変更後:
```tsx
      <p className={s.sources}>
        出典：遺族年金は日本年金機構・厚生年金保険法（令和8年度の年金額は報道値ベースで確定前）、教育費は文部科学省
        子供の学習費調査。生活費率・就労推定などの「当社基準」は公的出典のない当社の見立てです。
      </p>

      <div className={s.section}>
        <Link className={s.link} href={`/save?${q.toString()}`}>
          この結果を保存して、変化があったときにお知らせを受け取る →
        </Link>
      </div>

      <div className={s.draftNote}>
```

- [ ] **Step 3: 型検査とlintが通ることを確認する**

Run: `npm run typecheck && npm run lint`
Expected: エラーなし

- [ ] **Step 4: 手動でブラウザ確認する**

Run: `npm run dev`
1. `/wizard` を最後まで進めて `/result` を開く
2. ページ末尾の「この結果を保存して〜」リンクが表示されていることを確認する
3. クリックして `/save?...` に遷移し、確認画面が表示されることを確認する

Expected: `/save`で「この結果を保存しますか？」の確認画面が表示される(この時点では保存ボタンを押さなくてよい。実際の保存確認はTask 11で行う)

- [ ] **Step 5: コミット**

```bash
git add app/save/page.tsx app/save/SaveConsent.tsx app/save/page.module.css app/result/page.tsx
git commit -m "feat(T-13): 初回保存の同意画面(独立した確認画面)を追加"
```

---

## Task 9: 通知着地画面(UI案A)・削除API

**Files:**
- Create: `app/notice/[token]/page.tsx`
- Create: `app/notice/[token]/DeleteRecord.tsx`
- Create: `app/notice/[token]/page.module.css`
- Create: `app/api/watch/households/[token]/route.ts`

**Interfaces:**
- Consumes: `createFirestoreWatchStore`(Task 5)、`encodeSelections`(`src/wizard/url.ts`)
- Produces: `/notice/{token}`ページ、`DELETE /api/watch/households/{token}`

- [ ] **Step 1: 削除APIを実装する**

`app/api/watch/households/[token]/route.ts`:
```ts
/**
 * DELETE /api/watch/households/:token ─ 世帯の保存記録を即時物理削除する(SPEC.md US-10)
 */
import { NextResponse } from "next/server";
import { createFirestoreWatchStore } from "../../../../../src/watch/store.firestore.js";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const store = createFirestoreWatchStore();
  const household = await store.findByToken(token);
  if (!household) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await store.deleteHousehold(household.id);
  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 2: 通知着地画面を実装する**

`app/notice/[token]/page.tsx`:
```tsx
/**
 * 通知(Slack)から戻ってきたときの着地画面(UI案A)。
 *
 * ここではまだ金額を出さない。「詳しく見直す」を押した人だけ /result に進む(二段階同意)。
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { encodeSelections } from "../../../src/wizard/url.js";
import { createFirestoreWatchStore } from "../../../src/watch/store.firestore.js";
import { DeleteRecord } from "./DeleteRecord.js";
import s from "./page.module.css";

export default async function NoticePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const store = createFirestoreWatchStore();
  const household = await store.findByToken(token);
  if (!household) notFound();

  const query = encodeSelections(household.wizardSelections);

  return (
    <main className={s.page}>
      <p className={s.eyebrow}>お金ドクター</p>
      <h1 className={s.title}>お子さんの成長で、状況が変わっているかもしれません</h1>
      <p className={s.body}>前回の診断から時間が経っています。ここではまだ金額は出しません。</p>
      <Link className={s.primaryButton} href={`/result?${query}`}>
        詳しく見直す →
      </Link>
      <DeleteRecord token={token} />
    </main>
  );
}
```

`app/notice/[token]/DeleteRecord.tsx`:
```tsx
"use client";

/**
 * 保存記録の削除(SPEC.md US-10)。確認は簡易な confirm() で十分(取り消せる操作ではないため一拍置く)。
 */
import { useState } from "react";
import s from "./page.module.css";

export function DeleteRecord({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "deleting" | "done" | "error">("idle");

  async function handleDelete() {
    if (!confirm("この診断の記録を削除しますか？削除すると、以後お知らせは届きません。")) return;
    setStatus("deleting");
    try {
      const res = await fetch(`/api/watch/households/${token}`, { method: "DELETE" });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className={s.done}>削除しました。</p>;
  }

  return (
    <div className={s.deleteRow}>
      <button
        type="button"
        className={s.deleteButton}
        onClick={handleDelete}
        disabled={status === "deleting"}
      >
        {status === "deleting" ? "削除しています…" : "この記録を削除する"}
      </button>
      {status === "error" && <p className={s.error}>削除できませんでした。</p>}
    </div>
  );
}
```

`app/notice/[token]/page.module.css`:
```css
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 56px 20px;
  text-align: center;
}

.eyebrow {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--color-text);
}

.body {
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin-bottom: 28px;
}

.primaryButton {
  display: inline-block;
  padding: 14px 28px;
  border-radius: 8px;
  background: var(--color-primary);
  color: var(--color-text-on-inverse);
  font-weight: 700;
  text-decoration: none;
}

.deleteRow {
  margin-top: 40px;
}

.deleteButton {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}

.done {
  color: var(--color-success-text);
}

.error {
  color: var(--color-error-text);
  margin-top: 8px;
}
```

- [ ] **Step 3: 型検査とlintが通ることを確認する**

Run: `npm run typecheck && npm run lint`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add app/api/watch/households app/notice
git commit -m "feat(T-13): 通知着地画面(UI案A)と削除APIを追加"
```

---

## Task 10: 環境変数の追加とチケット化

**Files:**
- Modify: `.env.example`
- Modify: `docs/TICKETS.md`

- [ ] **Step 1: `.env.example` に追記する**

`.env.example` の末尾に追記:
```
# 気づき通知(継続的な見直し)で使う Slack Incoming Webhook の URL。
# 用途：学齢の節目を検知したときに、きっかけだけの通知を投稿する(数字は含めない)。
# 取得先：Slackワークスペースの「Incoming Webhooks」アプリで発行する。
SLACK_WEBHOOK_URL=

# Cloud Scheduler から POST /api/watch/run を叩くときの共有シークレット。
# 用途：このルートは誰でも叩けると困る(通知の乱発)ため、ヘッダ X-Watch-Secret で照合する。
# 決め方：ランダムな文字列を生成し、Secret Manager と Cloud Scheduler の両方に設定する。
WATCH_CRON_SECRET=

# 気づき通知のリンク(マジックリンク)を組み立てる基底URL。
# 用途：Slack通知に載せる /notice/{token} の絶対URLを作るため。
# 値の例：本番なら https://okane-kenko-caiwgo7uta-an.a.run.app
WATCH_BASE_URL=
```

- [ ] **Step 2: `docs/TICKETS.md` にチケットを追記する**

`docs/TICKETS.md` の末尾(`## 着手前に必ず終わらせること`セクションの直前)に追記:
```markdown
## T-13 ─ 気づき通知(継続的な見直し)フェーズ2a

**価値**：一回で終わる健康診断から、たまに見直したくなる主治医へ。範囲は保険のまま、継続性で価値を出す。
設計 → [`docs/hackathon/2026-09-14_watch-notify-design.md`](hackathon/2026-09-14_watch-notify-design.md)

- [x] 子の学齢の節目到達を判定する純粋関数(`src/watch/milestones.ts`)
- [x] Watchストア(Firestore：`households` / `notice_log`)
- [x] Slack Incoming Webhookへの通知投稿
- [x] 観察→判断→行動→記録のウォッチャー本体(`src/watch/run.ts`)
- [x] Cloud Scheduler用API `POST /api/watch/run`(共有シークレットで保護)
- [x] 同意API `POST /api/watch/consent`
- [x] 初回保存の同意画面(独立した確認画面)
- [x] 通知着地画面(`/notice/{token}`)・削除API(SPEC.md US-10)

**完了条件**：Slack通知→着地画面→「詳しく見直す」→`/result`という一連の流れが、実際のFirestore・Slackで動作確認できる(Task 11)。

**明示的にスコープ外**：制度側の監視(フェーズ2b・別途設計)、住宅ローン・教育費などを独立機能として追加すること(既存のOut of Scope判断を維持)。
```

- [ ] **Step 3: コミット**

```bash
git add .env.example docs/TICKETS.md
git commit -m "docs(T-13): 気づき通知の環境変数とチケットを記録する"
```

---

## Task 11(最終・人手を含む): インフラ準備と一連の動作確認

**このタスクにコードはない。** 人手によるGCP設定と、実際のFirestore・Slackに対する手動確認を行う。

- [ ] **Step 1: Firestoreを有効化する(人手・GCPコンソールまたはgcloud)**

```bash
gcloud firestore databases create --project=okane-kenko-507122 --location=asia-northeast1 --type=firestore-native
```
Expected: プロジェクト`okane-kenko-507122`にNativeモードのFirestoreデータベースが作成される(既に存在する場合はこのコマンドはエラーになるので、既存有無を先に`gcloud firestore databases list --project=okane-kenko-507122`で確認する)

- [ ] **Step 2: Cloud Runの実行サービスアカウントにFirestore権限を付与する(人手)**

```bash
gcloud projects add-iam-policy-binding okane-kenko-507122 \
  --member="serviceAccount:<Cloud Runサービスの実行SA>" \
  --role="roles/datastore.user"
```
Expected: 実行SAが`households`・`notice_log`コレクションを読み書きできるようになる(実行SAのメールアドレスは`gcloud run services describe`で確認する)

- [ ] **Step 3: Slack Incoming Webhookを発行する(人手)**

Slackワークスペースで「Incoming Webhooks」アプリを追加し、通知先チャンネルを選んでWebhook URLを発行する。

- [ ] **Step 4: 環境変数を設定する(人手)**

`.env.local`に実値を設定する:
```
SLACK_WEBHOOK_URL=<発行したWebhook URL>
WATCH_CRON_SECRET=<ランダムな文字列。例: openssl rand -hex 32 で生成>
WATCH_BASE_URL=http://localhost:3000
```
本番(Cloud Run)には同じ3つをSecret Manager経由で設定する(`GEMINI_API_KEY`と同じ方式)。

- [ ] **Step 5: ローカルでFirestoreにアクセスできるようにする(人手)**

```bash
gcloud auth application-default login
```
Expected: ローカルの`npm run dev`からFirestoreへ書き込める(サービスアカウントキーфайлをダウンロードしない、標準的な方法)

- [ ] **Step 6: 自動テストと型検査を確認する**

Run: `npm test && npm run typecheck && npm run lint`
Expected: すべて green

- [ ] **Step 7: 同意フローを手動確認する**

1. `npm run dev`を起動し、`/wizard`を完了して`/result`へ進む(子を1人、生年をちょうど節目の1つ前の年齢になるよう設定する。例：今年6歳になる年の1つ前の生年)
2. 「この結果を保存して〜」リンクから`/save`へ進み、「保存してお知らせを受け取る」を押す
3. Firestoreコンソールで`households`コレクションに1件ドキュメントが作成されていることを確認する

Expected: `households`に`token`・`wizardSelections`・`lastDiagnosis`・`consentedAt`を持つドキュメントが1件できている

- [ ] **Step 8: ウォッチャーの実行を手動確認する**

```bash
curl -X POST http://localhost:3000/api/watch/run \
  -H "X-Watch-Secret: <WATCH_CRON_SECRETの値>"
```
Expected: レスポンスが`{"checked":1,"notified":1,"errors":[]}`のようになり、SlackのWebhook先チャンネルに「お子さんが◯歳になりました。前回の診断からの変化を確認できます。」というメッセージと`/notice/{token}`のリンクが投稿される

- [ ] **Step 9: 通知着地画面と削除を手動確認する**

1. Slackに届いたリンクを開き、`/notice/{token}`で金額を含まない画面が表示されることを確認する
2. 「詳しく見直す」を押して`/result`に遷移し、フル診断結果が表示されることを確認する
3. 再度`/notice/{token}`を開き、「この記録を削除する」を押す
4. Firestoreコンソールで該当ドキュメントが消えていることを確認する

Expected: 一連の流れ(Slack→着地画面→result→削除)がすべて実際に動く

- [ ] **Step 10: Cloud Schedulerジョブを作成する(人手・本番デプロイ後)**

```bash
gcloud scheduler jobs create http watch-notify-weekly \
  --project=okane-kenko-507122 \
  --location=asia-northeast1 \
  --schedule="0 9 * * 1" \
  --uri="https://<本番のCloud Run URL>/api/watch/run" \
  --http-method=POST \
  --headers="X-Watch-Secret=<WATCH_CRON_SECRETの値>"
```
Expected: 毎週月曜9時(JST)に`/api/watch/run`が自動実行される
