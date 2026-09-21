"use client";

/**
 * この結果のよみとき（T-07）─ AI が書いたテンプレを受け取り、**数値はこちらで差し込む**。
 *
 * 受け取るのは `{{selfRange}}` のようなプレースホルダだけのテンプレで、金額は
 * サーバが算定した値マップ（`values`）からしか入らない。だからストリーミング中でも
 * 数値が間違いようがない。数値検査（G-1）と禁止語・結論の検査はサーバ側で走り、
 * 落ちたら退避文が1回だけ届く（`fallback` イベント）。
 *
 * AI が使えないとき（鍵が無い・落ちた・遅い）は `initialText`（テンプレの退避文）のまま。
 * **AI を止めても結果画面が成立する**という T-07 の完了条件は、ここでも守られている。
 *
 * **見出しは「やさしい説明」から「この結果のよみとき」に変えた**（2026-09-21・UIラベル規約）。
 * 「やさしい」は品質の自己評価で、しかも「AI が書いた」という由来を曖昧に抱え込んでいた。
 * **名前は機能を名乗り、由来は本文で開示する**（`SELF_PRAISE_WORDS` が本籍）。
 *
 * **既定で折りたたむ**（2026-09-21・視覚の DoD (a)）。
 * AI の本文は実測 239字・872px で、**図も大きな数字も無い区間を1画面ぶん作っていた**。
 * 開示ブロックで確立した型をそのまま当てる ── 決定的な部分（冒頭1文）は露出し、
 * 全文は**文字数を明示した1タップ**の奥に置く。
 */
import { useEffect, useState } from "react";
import type { PlaceholderValues } from "../../src/narrate/stream.js";
import { renderStreamed } from "../../src/narrate/stream.js";
import s from "./page.module.css";

type Mode = "waiting" | "streaming" | "done" | "fallback";

/** 「AIが書いた文が検査に落ちた」理由（`FallbackReason` のうち検査由来のもの）。
 *  ここに無い理由（api_error・timeout・ai_unavailable）は、そもそも文が届いていない。 */
const GUARD_REASONS = ["g1_raw_number", "unknown_placeholder", "guardrail", "empty"];

interface Event {
  type: "chunk" | "done" | "fallback";
  text?: string;
  reason?: string;
}

export function Narration({
  query,
  values,
  initialText,
  aiEnabled,
  summary,
}: {
  query: string;
  values: PlaceholderValues;
  initialText: string;
  aiEnabled: boolean;
  /**
   * 既定露出のサマリー（2026-09-21・視覚の DoD (a)）。
   *
   * **よみときは算定結果の数字を差し込んでいる**（G-1）のだから、
   * その数字を明朝で見せれば、この区間には本来アンカーがある。
   * 冒頭1文の散文だけを出していたのは、**持っている数字を使っていなかった**だけ。
   */
  summary: { verdict: string; tone: string; needText: string; coverageText: string };
}) {
  const [template, setTemplate] = useState("");
  const [text, setText] = useState(initialText);
  const [mode, setMode] = useState<Mode>(aiEnabled ? "waiting" : "done");
  // 退避の理由。**「検査に落ちた」と「AIが呼べなかった」を混ぜない。**
  // 2026-09-20 に本番で鍵が無効になっていたとき、画面は「検査を通らなかった」と
  // 言い続けていた。起きていないことを断定するのは、金額を間違えるのと同じ種類の嘘。
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!aiEnabled) return;
    const abort = new AbortController();

    (async () => {
      const res = await fetch(`/api/narrate?${query}`, { signal: abort.signal });
      if (!res.ok || !res.body) throw new Error(`narrate ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const e = JSON.parse(l) as Event;
          if (e.type === "chunk" && e.text) {
            acc += e.text;
            setTemplate(acc);
            setMode("streaming");
          } else if (e.type === "fallback" && e.text) {
            // 検査に落ちた／AIが使えない。退避文に置き換えて終わる（破棄するだけで済む）
            setText(e.text);
            setReason(e.reason ?? null);
            setMode("fallback");
          } else if (e.type === "done") {
            setMode("done");
          }
        }
      }
    })().catch((e: unknown) => {
      if (abort.signal.aborted) return; // 画面遷移での中断は失敗ではない
      console.warn("[narrate] 受信に失敗したため退避文を表示します", e);
      setReason("api_error"); // 検査ではなく、届かなかった側
      setMode("fallback");
    });

    return () => abort.abort();
  }, [aiEnabled, query]);

  const streamed = mode === "streaming" || mode === "done";
  const body = streamed && template ? renderStreamed(template, values) : text;

  /**
   * 露出する冒頭。**1文だけ**（句点で切る）。
   * 折りたたみの中が全文で、ここはその先頭を抜き出したもの
   * ── 要約を別に書くと、露出と全文が食い違う余地ができる。
   */
  const firstSentence = (() => {
    const i = body.indexOf("。");
    return i < 0 ? body : body.slice(0, i + 1);
  })();
  const hasMore = firstSentence.length < body.length;

  return (
    <div className={s.section}>
      <h2 className={s.h2}>この結果のよみとき</h2>
      {/*
        **分担を先に言う。** これは責務境界（CLAUDE.md）の開示そのものなので、
        折りたたみの外に置く ── 畳んだ中に入れると、読まれないまま文章だけが届く。

        **同じ事実を2回言わない**（2026-09-21）。
        以前は冒頭にこの分担文、末尾に「※ 上の本文は AI が書いています。金額は AI に
        作らせず、算定結果を差し込んでいます」があり、700px の中で同旨が2回出ていた。
        ※注が持っていた固有情報（**算定結果と同じ値を差し込んでいる**＝ G-1 の実装事実）を
        この1文に畳み、※注は**実際に起きたこと**（AI が動いたか／検査に落ちたか）だけにした。
      */}
      <p className={s.basis}>
        ことばは AI
        が書いています。数字と判定は計算エンジンのもの（このページの内訳と同じ値を差し込んでいます）で、AI
        は変えられません。
      </p>

      {/*
        **既定露出は、判定バッジ＋必要額といまの保障の1行サマリー。**
        散文の冒頭1文だけを出していたときは、この区間に視覚アンカーが1つも無かった。
        数字はすべて算定結果から来ており、ここで作っていない。
      */}
      <div className={s.narrationSummary}>
        <span className={`${s.narrationBadge} ${s[summary.tone] ?? ""}`}>{summary.verdict}</span>
        <span className={s.narrationStat}>
          <span className={s.narrationStatLabel}>必要額</span>
          <span className={s.narrationStatValue}>{summary.needText}</span>
        </span>
        <span className={s.narrationStat}>
          <span className={s.narrationStatLabel}>いまの保障</span>
          <span className={s.narrationStatValue}>{summary.coverageText}</span>
        </span>
      </div>

      <div
        aria-busy={mode === "streaming" || mode === "waiting"}
        className={s.narration}
        data-testid="narration"
      >
        {/* 露出は冒頭1文。残りは下のトグルの奥（開示の見せ方・CLAUDE.md） */}
        {hasMore ? firstSentence : body}
      </div>

      {hasMore && (
        <details className={s.criteria}>
          {/* **件数（ここでは文字数）を出す。** 数の無い「すべて見る」は開示ではなく隠蔽に近い */}
          {/* 字数は**既にある数字**。あるべき声量で出す（DoD (b) の組版を (a) の解に使う） */}
          <summary>
            続きを読む（全文 <span className={s.foldCount}>{body.length}</span> 字）
          </summary>
          <p className={s.narrationFull}>{body}</p>
        </details>
      )}
      {/* 断り書きは「実際に起きたこと」を書く。AI が動く前から「AI が書いています」と
          出すと、定型文が出ている場面で嘘になる（JS が動かない環境ではそれが常に起きる）。 */}
      {/*
        ※注は**実際に起きたこと**だけを書く（分担そのものは上の1文が言っている）。
        AI が動く前から「AI が書いています」と出すと、定型文が出ている場面で嘘になる
        （JS が動かない環境ではそれが常に起きる）。
      */}
      {!(streamed && template) && (
        <p className={s.basis}>
          {mode === "fallback" ? (
            GUARD_REASONS.includes(reason ?? "") ? (
              <>※ いまは定型文です（AI の文章が検査を通らなかったため）。</>
            ) : (
              <>※ いまは定型文です（AI をいま呼び出せなかったため）。結論はどちらでも同じです。</>
            )
          ) : (
            <>※ いまは定型文です。</>
          )}
        </p>
      )}
    </div>
  );
}
