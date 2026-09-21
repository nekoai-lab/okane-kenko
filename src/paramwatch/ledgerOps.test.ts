/**
 * 台帳を自己整合させる操作（D4・2026-09-22）。
 * 確かめたいのは「適用後の params が矛盾しない」ことと「材料が台帳と一致文だけ」であること。
 */
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadParams, loadParamsText } from "../params/index.js";
import { ledgerOps } from "./ledgerOps.js";
import { resolveTarget } from "./paths.js";
import { applyOps } from "./yamlPatch.js";

const P = loadParams("2026-08");
const { text } = loadParamsText("2026-08");
const EV = {
  matchedText: "退職日が令和７年４月１日以降である場合は原則１か月",
  sourceUrl: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000139508.html",
  // UTC では 9/21、日本時間では 9/22（取得日は日本時間で書く）
  fetchedAt: "2026-09-21T20:30:00.000Z",
};

describe("ledgerOps：T-G の台帳を自己整合させる", () => {
  const target = resolveTarget(P, "kihonTeate.restrictionMonthsVoluntary");
  if (!target) throw new Error("target");
  const after = applyOps(text, [
    { kind: "set", path: target.path, value: 1 },
    ...ledgerOps(target, EV),
  ]);
  const src = parse(after).kihonTeate.sources.restrictionMonthsVoluntary;

  it("温存の期限と改正予定が消え、施行日は一致文の和暦から入る", () => {
    expect(parse(after).kihonTeate.restrictionMonthsVoluntary).toBe(1);
    expect(src.expires).toBeUndefined();
    expect(src.pendingChange).toBeUndefined();
    expect(src.effectiveFrom).toBe("2025-04-01");
    expect(src.verified).toBe(true);
  });

  it("note は台帳と一致文だけで組む（取得日は日本時間）", () => {
    expect(src.note).toBe(
      `2025-04-01 施行の値。一次情報の一致文「${EV.matchedText}」（${EV.sourceUrl}・2026-09-22 取得）。`,
    );
  });

  it("旧状態を説明していたコメントも消える（残すと「温存中」と主張し続ける）", () => {
    expect(after).not.toContain("旧値 2 をわざと残している");
    expect(after).not.toContain("いま入っている 2 が施行されていた期間の開始日");
  });

  it("他の値は1つも動かない", () => {
    const before = parse(text);
    const a = parse(after);
    before.kihonTeate.restrictionMonthsVoluntary = 1;
    before.kihonTeate.sources.restrictionMonthsVoluntary = src;
    expect(a).toEqual(before);
  });
});

describe("ledgerOps：改定周期の expires は残す", () => {
  it("pendingChange の無い expires（次の改定日）は消さない", () => {
    const target = resolveTarget(P, "kihonTeate.restrictionMonthsVoluntary");
    if (!target || !target.ledger) throw new Error("target");
    const synthetic = {
      ...target,
      ledger: { ...target.ledger, pendingChange: undefined, expires: "2027-08-01" },
    };
    const kinds = ledgerOps(synthetic, EV).map((o) => `${o.kind}:${o.path.at(-1)}`);
    expect(kinds).not.toContain("delete:expires");
    expect(kinds).toContain("replace:effectiveFrom");
  });

  it("一致文に日付が無ければ effectiveFrom は null（作らない）", () => {
    const target = resolveTarget(P, "kihonTeate.restrictionMonthsVoluntary");
    if (!target) throw new Error("target");
    const op = ledgerOps(target, { ...EV, matchedText: "原則１か月" }).find(
      (o) => o.path.at(-1) === "effectiveFrom",
    );
    expect(op).toMatchObject({ kind: "replace", value: null });
  });
});
