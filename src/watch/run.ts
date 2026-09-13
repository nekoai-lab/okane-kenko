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
