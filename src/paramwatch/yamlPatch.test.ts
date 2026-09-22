/**
 * 提案に載せる yaml 差分の検査（2026-09-22）。
 *
 * いちばん確かめたいのは「**人がそのまま当てられる**」こと。
 * `git apply --check` を実際に通す ── 形が正しそうに見えるだけの差分は、承認のあとで当たらない。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadParamsText } from "../params/index.js";
import { PRE_TG_FILE, PRE_TG_TEXT } from "./__fixtures__/preTg.js";
import { applyEdits, buildYamlPatch } from "./yamlPatch.js";

/**
 * **置き換え・削除を試す相手は、改正前の凍結コピー**（2026-09-23）。
 *
 * T-G を本物の `params/` に適用したことで、生きた params では
 * `restrictionMonthsVoluntary` の編集が「1 → 1」＝**何も変えない編集**になり、
 * 温存の `pendingChange` / `expires` も消えた。前提が消えた検査は、
 * 緑のまま何も確かめなくなるか、位置が無いと言って落ちるかのどちらかになる。
 */
const file = PRE_TG_FILE;
const text = PRE_TG_TEXT;
const EDITS = [
  { path: ["kihonTeate", "restrictionMonthsVoluntary"], value: 1 },
  { path: ["public", "izokuKisoBase", "value"], value: 847300 },
  { path: ["public", "childAdd1_2", "value"], value: 243800 },
];

/**
 * **本物の params にも当たること**は、いま値が違う2件（遺族基礎年金）で確かめ続ける。
 *
 * **この2件を将来適用したら、この検算も被験体を失う**（差が無い編集になり、
 * 「当たった」ことを確かめられなくなる）。そのときは検算を消さず、
 * **凍結コピー側に新しいズレを1件足して**、ここを差し替えること。
 */
const LIVE = loadParamsText("2026-08");
const LIVE_EDITS = [
  { path: ["public", "izokuKisoBase", "value"], value: 847300 },
  { path: ["public", "childAdd1_2", "value"], value: 243800 },
];

describe("applyEdits：値の文字だけを置き換える", () => {
  it("読み直すと候補値になっていて、それ以外の値は1つも動かない", () => {
    const before = parse(text);
    const after = parse(applyEdits(text, EDITS));
    expect(after.kihonTeate.restrictionMonthsVoluntary).toBe(1);
    expect(after.public.izokuKisoBase.value).toBe(847300);
    before.kihonTeate.restrictionMonthsVoluntary = 1;
    before.public.izokuKisoBase.value = 847300;
    before.public.childAdd1_2.value = 243800;
    expect(after).toEqual(before);
  });

  it("コメントを含む値以外の行は1文字も変えない（変わる行は3行だけ）", () => {
    const a = text.split("\n");
    const b = applyEdits(text, EDITS).split("\n");
    expect(b).toHaveLength(a.length);
    expect(a.filter((line, i) => line !== b[i])).toHaveLength(3);
  });

  it("params に無い位置は黙って足さず、止まる", () => {
    expect(() =>
      applyEdits(text, [{ path: ["public", "noSuchKey", "value"], value: 1 }]),
    ).toThrow();
  });
});

describe("buildYamlPatch：git apply がそのまま通る", () => {
  it("git apply --check に通る（いま本番にある params そのものに当てる）", () => {
    const dir = mkdtempSync(join(tmpdir(), "yamlpatch-"));
    mkdirSync(join(dir, "params"));
    writeFileSync(join(dir, LIVE.file), LIVE.text);
    const patch = buildYamlPatch(LIVE.file, LIVE.text, LIVE_EDITS);
    writeFileSync(join(dir, "p.diff"), patch);
    execFileSync("git", ["init", "-q"], { cwd: dir });
    // 失敗したら例外で落ちる（黙って通さない）
    execFileSync("git", ["apply", "--check", "p.diff"], { cwd: dir });
  });

  it("行の削除を含む差分も git apply --check に通る（台帳の自己整合・D4）", () => {
    const dir = mkdtempSync(join(tmpdir(), "yamlpatch-"));
    mkdirSync(join(dir, "params"));
    writeFileSync(join(dir, file), text);
    const base = ["kihonTeate", "sources", "restrictionMonthsVoluntary"];
    const patch = buildYamlPatch(file, text, [
      { kind: "set", path: ["kihonTeate", "restrictionMonthsVoluntary"], value: 1 },
      { kind: "replace", path: [...base, "effectiveFrom"], value: "2025-04-01" },
      { kind: "delete", path: [...base, "pendingChange"] },
      { kind: "delete", path: [...base, "expires"] },
      { kind: "replace", path: [...base, "note"], value: "テスト" },
    ]);
    writeFileSync(join(dir, "p.diff"), patch);
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["apply", "--check", "p.diff"], { cwd: dir });
  });

  it("変更が無ければ空の差分", () => {
    expect(buildYamlPatch(file, text, [])).toBe("");
  });
});
