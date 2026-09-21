/**
 * 「使った前提と出典」（仕様 §5.3・照合表 #9）
 *
 * **移植元は `docs/design-mock/result.html` の `使った前提と出典 — すべて結果に表示します`。**
 * 出典を**チップで並べる**組版で、滝の `出典: 日本年金機構` と同じ薄墨のキャプション型にそろえる。
 *
 * ここで旧「参考（公的機関）」のリンク箇条書きと、その下の散文1段落を**置換**した。
 * 同じ出典が**リスト・散文・滝のキャプションの3か所**に散っており、
 * どれが全部なのかが読み手に分からなかった（CLAUDE.md「置換であって共存ではない」）。
 *
 * **モックの4チップをそのまま書き写さない。**
 * モックは「生活費水準: 総務省 家計調査」を挙げているが、この実装の生活費は
 * **利用者の回答**（幅）に当社基準の率を掛けたもので、家計調査は使っていない。
 * サンプルの出典を書き写すと、使っていない統計を使ったことにしてしまう。
 *
 * **ラベルとURLは `params` から受け取る。** 画面で出典名を手打ちしない
 * ── 制度側が変わったときに、値だけ更新されて出典表示が古いまま残る。
 */
import { Fold } from "./Fold.js";
import s from "./usedSources.module.css";

export interface UsedSource {
  /** 何の値の出典か（`遺族年金の額` など） */
  what: string;
  /** 機関名＋制度名。`params` の `source` / `sources.*.label` から来る */
  label: string;
  /** 一次情報のURL。無ければ null（チップはリンクにしない） */
  url: string | null;
  /** 一次情報に当たって確認済みか。false なら but書きを添える */
  verified: boolean;
}

export function UsedSources({ items, note }: { items: UsedSource[]; note: string }) {
  return (
    <section className={s.wrap} aria-labelledby="sources-heading">
      {/*
        **見出しの約束を実態に合わせる**（2026-09-21）。
        モックの「すべて結果に表示します」のまま折りたたむと、見出しが嘘になる。
        畳んだ中が完全な記録であることは変わらないので、**約束の言い換えであって後退ではない**。
        件数を出すのは開示の規約（数の無い「すべて見る」は隠蔽に近い）。
      */}
      <h2 className={s.head} id="sources-heading">
        使った前提と出典 — 全<span className={s.count}>{items.length}</span>件をここに残しています
      </h2>
      {/* 参照材なので畳む（視覚の DoD (a)）。露出は件数を含む見出しだけ */}
      <Fold count={`（全${items.length}件）`} label="出典を見る">
        <ul className={s.chips}>
          {items.map((x) => {
            const body = (
              <>
                <span className={s.what}>{x.what}:</span>
                <span className={s.label}>{x.label}</span>
                {/* **未確認であることを黙らせない。** 確定値だと思われたまま持ち帰られるのを防ぐ */}
                {!x.verified && <span className={s.unverified}>一次情報 未確認</span>}
              </>
            );
            return (
              <li className={s.chip} key={x.what}>
                {x.url ? (
                  <a className={s.link} href={x.url} rel="noreferrer" target="_blank">
                    {body}
                  </a>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
        <p className={s.note}>{note}</p>
      </Fold>
    </section>
  );
}
