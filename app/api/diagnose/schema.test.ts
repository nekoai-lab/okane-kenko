/**
 * API 境界のテスト（T-02 完了条件の固定）
 *
 * zod 検証を通した入力が、算定エンジンで GT-01 と同じ結果になることを確かめる。
 * これにより「curl で POST すると GT-01 と同じ結果が返る」を、デプロイ前にコードで担保する。
 * asOf は算定に影響しない（有効期限判定にしか使われない）ので、ゴールデンと同じ日付で固定する。
 */
import { describe, expect, it } from "vitest";
import { diagnose } from "../../../src/calc/index.js";
import { loadParams } from "../../../src/params/index.js";
import { GOLDEN } from "../../../src/__tests__/households.js";
import { DiagnoseRequestSchema } from "./schema.js";

const MAN = 10_000;
const AS_OF = new Date("2026-08-17T12:00:00+09:00");
const man = (x: number) => Math.round(x / MAN);

describe("POST /api/diagnose の入力検証と算定", () => {
  const gt01 = GOLDEN.find((c) => c.id === "GT-01");
  if (!gt01) throw new Error("GT-01 が households.ts に見つかりません");

  it("GT-01 の入力を検証で受理し、算定結果が GT-01 と一致する", () => {
    const parsed = DiagnoseRequestSchema.safeParse(gt01.input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const r = diagnose(loadParams("2026-08"), parsed.data, AS_OF);
    expect(r.householdHeadline.kind).toBe(gt01.expect.headline);
    expect(r.self.verdict).toBe(gt01.expect.self.verdict);
    expect(man(r.self.gap.amount)).toBe(gt01.expect.self.gapAmount);
    expect(r.medical.verdict).toBe(gt01.expect.medical);
    expect(r.reform2028.applicable).toBe(gt01.expect.reform2028);
  });

  it("金額が負の入力は検証で弾く（不正入力を算定に通さない）", () => {
    const bad = { ...gt01.input, assets: -1 };
    expect(DiagnoseRequestSchema.safeParse(bad).success).toBe(false);
  });

  it("必須項目が欠けた入力は検証で弾く", () => {
    const { self: _self, ...withoutSelf } = gt01.input;
    expect(DiagnoseRequestSchema.safeParse(withoutSelf).success).toBe(false);
  });
});
