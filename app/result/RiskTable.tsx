/**
 * リスク別健康診断表（結果画面の玄関・仕様 §5.3）
 *
 * **1280px のモックは5列のテーブルだが、本番は 390px 基準なのでカードに組み直す**
 * （`docs/design-mock/README.md` の指示どおり）。列を潰すと所見が読めなくなる。
 *
 * **金額はここで作らない。** 受け取った文字列を描くだけ（CLAUDE.md「本番UIに金額をハードコードしない」）。
 */
import Link from "next/link";
import s from "./riskTable.module.css";

/** 表示のための1行。金額はすべて呼び出し側が算定結果から作って渡す */
export interface RiskRow {
  key: string;
  title: string;
  subtitle: string;
  /** 判定の見た目。`none` は未診断 */
  tone: "ok" | "check" | "short" | "none";
  verdictLabel: string;
  precisionLabel: string;
  note: string;
  /** 同ページ内へのアンカー、または準備中の表示 */
  link: { href: string; label: string } | { pending: string };
}

export function RiskTable({ rows, caption }: { rows: RiskRow[]; caption: string }) {
  return (
    <section className={s.wrap} aria-labelledby="risk-table-heading">
      <h2 className={s.heading} id="risk-table-heading">
        あなたのお金の健康診断表
      </h2>
      <p className={s.lead}>
        万が一は、ひとつではありません。人生のリスクを項目別に、正直な精度表示つきで診ます。
      </p>
      <p className={s.caption}>{caption}</p>

      <ul className={s.list}>
        {rows.map((r) => (
          <li className={s.card} key={r.key}>
            <div className={s.cardHead}>
              <div>
                <p className={s.title}>{r.title}</p>
                <p className={s.subtitle}>{r.subtitle}</p>
              </div>
              <span className={`${s.badge} ${s[r.tone]}`}>{r.verdictLabel}</span>
            </div>
            <p className={s.precision}>精度：{r.precisionLabel}</p>
            <p className={s.note}>{r.note}</p>
            {"href" in r.link ? (
              <Link className={s.link} href={r.link.href}>
                {r.link.label}
              </Link>
            ) : (
              // **未実装のリンク先を沈黙させない。** 押せないなら、その理由まで書く
              <span className={s.pending}>{r.link.pending}</span>
            )}
          </li>
        ))}
      </ul>

      {/*
        仕様 §5.3：**緑が3つ並んだときに実力以上の安心を売らない**ための注記。
        病気・けが・失業の3行は、同じ貯蓄を受け皿として**単独で**判定している。
        法的免責のような小さい文字にしない（12px以上・本文色）。
      */}
      <p className={s.overlapNote}>
        病気・けが・失業の判定は、それぞれ<strong>単独で起きた場合</strong>の見立てです。
        同じ貯蓄を各行の受け皿として見ています。
      </p>

      <dl className={s.legend}>
        <dt>判定</dt>
        <dd>
          <span className={`${s.badge} ${s.ok}`}>大丈夫のめやす</span>
          <span className={`${s.badge} ${s.check}`}>圏内・要精査</span>
          <span className={`${s.badge} ${s.short}`}>備え不足の可能性</span>
          <span className={`${s.badge} ${s.none}`}>未診断</span>
        </dd>
        <dt>精度</dt>
        <dd className={s.legendText}>
          「計算済み」はあなたの回答からの試算、「制度式で概算」は公的制度の計算式どおりの概算、
          「計算未対応」は正直な空欄です。
        </dd>
      </dl>
    </section>
  );
}
