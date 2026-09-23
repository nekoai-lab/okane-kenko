/**
 * 高額療養費の多数回該当を拾う検査（2026-09-23・D6）。
 *
 * **ここが静かに間違いやすい。** 一次情報の同じページに表が3つ並んでいる
 * （70歳未満の旧期間「～令和8年7月」／70歳未満の現行「令和8年8月～令和9年7月」／70歳以上）。
 * しかも**多数回該当の額は旧期間と現行で同じ**なので、**間違った表を読んでも値は正しく見える**。
 * 値の一致では検知できないので、**どの表から取ったか**を固定する。
 *
 * 相手は実ページの保存（`__fixtures__/kenpo-kogaku-2026-09-23.html`）。
 * ネットワークに出ないので、先方のサイトが落ちてもこの検査は動く。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadParams } from "../params/index.js";
import { extractAll } from "./extract.js";
import { PRE_TG } from "./__fixtures__/preTg.js";
import { isPromotable, verifyOps } from "./verifyOps.js";
import { resolveTarget } from "./paths.js";
import { loadWatchSources } from "./sources.js";

const HTML = readFileSync(
  join(process.cwd(), "src/paramwatch/__fixtures__/kenpo-kogaku-2026-09-23.html"),
  "utf-8",
);

/** `fetch.ts` の htmlToText と同じ正規化（本文の作られ方を変えたらここも合わせる） */
const TEXT = HTML.replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

const WATCH = loadWatchSources().watches.kogakuTasuukai;
const P = loadParams("2026-08");

describe("多数回該当の抽出（表の取り違えを起こさない）", () => {
  it("5区分とも1つの値に決まり、現行 params と一致する", () => {
    const got = extractAll(TEXT, WATCH.targets);
    expect(got.every((r) => r.ok)).toBe(true);
    const byKey = Object.fromEntries(got.map((r) => [r.key, r.ok ? r.value : null]));
    expect(byKey["kogaku.multipleOccurrence.区分ア"]).toBe(140100);
    expect(byKey["kogaku.multipleOccurrence.区分イ"]).toBe(93000);
    expect(byKey["kogaku.multipleOccurrence.区分ウ"]).toBe(44400);
    expect(byKey["kogaku.multipleOccurrence.区分エ"]).toBe(44400);
    expect(byKey["kogaku.multipleOccurrence.区分オ"]).toBe(24600);
    for (const [key, value] of Object.entries(byKey)) {
      expect(resolveTarget(P, key)?.current, key).toBe(value);
    }
  });

  /**
   * **値では見分けられないので、一致した文そのもので見分ける。**
   * 現行表の行には「令和8年8月〜」の自己負担限度額（270,300 / 179,100 / 85,800 / 61,500 / 36,900）が
   * 同じ行に並ぶ。旧期間の表なら 252,600 / 167,400 / 80,100 / 57,600 / 35,400 が並ぶ。
   */
  it("**旧期間（〜令和8年7月）や70歳以上の表からは拾っていない**", () => {
    const got = extractAll(TEXT, WATCH.targets);
    const texts = got.map((r) => (r.ok ? r.matchedText : ""));
    // 一致文は現行表の見出しから始まる（見出しはページ内に1回しか出ない）
    for (const t of texts) {
      expect(t.startsWith("70歳未満の方の区分（令和8年8月～令和9年7月）"), t.slice(0, 40)).toBe(
        true,
      );
    }
    // 現行表の限度額が一致文に含まれる（＝現行の行を読んでいる）
    const joined = texts.join(" ");
    for (const cur of ["270,300", "179,100", "85,800", "61,500", "36,900"]) {
      expect(joined, `現行表の ${cur} が一致文に無い`).toContain(cur);
    }
    // 旧期間の限度額は一致文に含まれない（＝古い表を読んでいない）
    for (const old of ["252,600", "167,400", "80,100", "57,600", "35,400"]) {
      expect(joined, `旧期間の ${old} を読んでいる`).not.toContain(old);
    }
    // 70歳以上の表にしか無い語も含まれない
    expect(joined).not.toContain("70歳以上");
    expect(joined).not.toContain("現役並み所得者");
  });

  /**
   * **見出しを外すと、止まらずに間違える。** ここがこの watch でいちばん危ない性質。
   *
   * 多数回該当の額は旧期間と現行で同じなので、違う表を読んでも
   * 「違う金額が2件」にならず、`ambiguous` で止まらない（＝止まる仕組みが働かない）。
   * 値は正しいまま、**根拠として残る一致文だけが無関係な場所のもの**になる。
   * だから見出しでの固定は「あると良い」ではなく**必須**。
   */
  it("見出しを外すと、値は正しいまま**一致文が現行表のものでなくなる**（止まらずに間違える）", () => {
    const loose = WATCH.targets.map((t) => ({
      ...t,
      pattern: t.pattern.replace("70歳未満の方の区分（令和8年8月～令和9年7月）", ""),
    }));
    const got = extractAll(TEXT, loose);
    // 止まらない：5件とも1つの値に決まってしまう
    expect(got.every((r) => r.ok)).toBe(true);
    // しかし一致文は現行表の見出しから始まらない（＝どの表から取ったか分からない）
    for (const r of got) {
      if (!r.ok) continue;
      expect(r.matchedText.startsWith("70歳未満の方の区分（令和8年8月～令和9年7月）")).toBe(false);
    }
  });
});

/**
 * **昇格したら、昇格を確かめていた検査は被験体を失う**（2026-09-23）。
 *
 * D6 の適用で `kogaku.sources.multipleOccurrence.verified` は true になったので、
 * 生きた params を相手にすると「昇格できる対象」が存在しなくなる。
 * CLAUDE.md「ズレを解消したら、そのズレを被験体にしていた検査を必ず点検する」に従い、
 * **適用前の凍結コピー**（`__fixtures__/pre-tg.yaml`＝T-G 適用直前＝多数回該当も昇格前）を相手にする。
 */
describe("検証の昇格（値は動かさない）", () => {
  it("台帳が verified: false なので昇格の対象になる", () => {
    const t = resolveTarget(PRE_TG, "kogaku.multipleOccurrence.区分ア");
    expect(t?.ledgerPath?.join(".")).toBe("kogaku.sources.multipleOccurrence");
    expect(t?.ledger?.verified).toBe(false);
    expect(isPromotable(t as NonNullable<typeof t>)).toBe(true);
  });

  it("5値で台帳は1つなので、昇格の操作は1回だけ・算定側の門も一緒に動かす", () => {
    const targets = WATCH.targets.map((t) => {
      const target = resolveTarget(PRE_TG, t.key);
      if (!target) throw new Error(t.key);
      return { key: t.key, label: t.label, target, value: target.current };
    });
    const ops = verifyOps(targets, {
      "kogaku.sources.multipleOccurrence": ["kogaku", "multipleOccurrenceVerified"],
    });
    // 台帳の verified／解消した pendingChange の削除／算定側の門 の3つだけ
    expect(ops).toEqual([
      { kind: "set", path: ["kogaku", "sources", "multipleOccurrence", "verified"], value: true },
      { kind: "delete", path: ["kogaku", "sources", "multipleOccurrence", "pendingChange"] },
      { kind: "set", path: ["kogaku", "multipleOccurrenceVerified"], value: true },
    ]);
    // **値を書き換える操作は1つも無い**（昇格で金額が動かないことを、操作の側で固定する）
    expect(ops.some((o) => o.path.includes("multipleOccurrence") && o.path.length === 3)).toBe(
      false,
    );
  });
});
