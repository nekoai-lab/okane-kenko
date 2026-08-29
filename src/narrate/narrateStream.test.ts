/**
 * ストリーミング中の検査のテスト（T-07 / T-08）。
 *
 * ここで守っているのは「事故のある文を画面に出さない」こと。実APIは叩かず、
 * 偽の生成器で AI の振る舞い（数字を書く・知らないプレースホルダを書く・煽る）を作る。
 */
import { describe, expect, it } from "vitest";
import { diagnose } from "../calc/index.js";
import { loadParams } from "../params/index.js";
import { GOLDEN } from "../__tests__/households.js";
import { type NarrationEvent, narrateStreamEvents } from "./narrateStream.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-17T12:00:00+09:00");
/** GT-02＝不足の世帯（結論の一致検査が効く） */
const D = diagnose(P, GOLDEN[1].input, AS_OF);

async function* fake(deltas: string[]): AsyncGenerator<string> {
  for (const d of deltas) yield d;
}

async function run(deltas: string[]): Promise<NarrationEvent[]> {
  const out: NarrationEvent[] = [];
  for await (const e of narrateStreamEvents(D, fake(deltas))) out.push(e);
  return out;
}

describe("narrateStreamEvents（T-07 ストリーミングの検査）", () => {
  it("素直なテンプレは、そのまま流して done で閉じる", async () => {
    const events = await run(["いまの前提では、{{conclusion}}。", "目安は {{selfRange}} です。"]);
    expect(events.map((e) => e.type)).toEqual(["chunk", "chunk", "done"]);
  });

  it("生の数字が出た時点で打ち切り、その差分は画面に出さない（G-1）", async () => {
    const events = await run(["目安は ", "約1200万円です。", "続きの文。"]);
    expect(events[0]).toEqual({ type: "chunk", text: "目安は " });
    expect(events[1].type).toBe("fallback");
    expect(events[1]).toMatchObject({ reason: "g1_raw_number" });
    expect(events).toHaveLength(2); // 打ち切るので「続きの文。」は流れない
    const shown = events.filter((e) => e.type === "chunk").map((e) => e.text ?? "");
    expect(shown.join("")).not.toMatch(/[0-9]/);
  });

  it("差し込めないプレースホルダが来たら退避する（壊れた文を出さない）", async () => {
    const events = await run(["月々は {{monthlyPremium}} です。"]);
    expect(events[0]).toMatchObject({ type: "fallback", reason: "unknown_placeholder" });
  });

  it("全文がそろってから禁止語・結論の矛盾を見て退避する（G-2/G-4/G-6）", async () => {
    const events = await run(["いまの前提では、{{conclusion}}。", "今すぐ見直してください。"]);
    expect(events.map((e) => e.type)).toEqual(["chunk", "chunk", "fallback"]);
    expect(events[2]).toMatchObject({ reason: "guardrail" });
  });

  it("空の生成は退避する（無言で空欄を出さない）", async () => {
    const events = await run(["", "  "]);
    expect(events.at(-1)).toMatchObject({ type: "fallback", reason: "empty" });
  });

  it("退避文には算定結果の金額が入っている（AIが落ちても数値は届く）", async () => {
    const events = await run(["約100万円"]);
    const fb = events.at(-1);
    expect(fb?.type).toBe("fallback");
    expect(fb?.type === "fallback" && fb.text).toContain("万円");
  });
});
