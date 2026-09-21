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
import { applyEdits, buildYamlPatch } from "./yamlPatch.js";

const { file, text } = loadParamsText("2026-08");
const EDITS = [
  { path: ["kihonTeate", "restrictionMonthsVoluntary"], value: 1 },
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
  it("git apply --check に通る", () => {
    const dir = mkdtempSync(join(tmpdir(), "yamlpatch-"));
    mkdirSync(join(dir, "params"));
    writeFileSync(join(dir, file), text);
    const patch = buildYamlPatch(file, text, EDITS);
    writeFileSync(join(dir, "p.diff"), patch);
    execFileSync("git", ["init", "-q"], { cwd: dir });
    // 失敗したら例外で落ちる（黙って通さない）
    execFileSync("git", ["apply", "--check", "p.diff"], { cwd: dir });
  });

  it("変更が無ければ空の差分", () => {
    expect(buildYamlPatch(file, text, [])).toBe("");
  });
});
