/**
 * リスク別健康診断表（結果画面の玄関・仕様 §5.3）
 *
 * **1280px のモックは5列のテーブルだが、本番は 390px 基準なのでカードに組み直す**
 * （`docs/design-mock/README.md` の指示どおり）。列を潰すと所見が読めなくなる。
 *
 * **視覚の DoD（CLAUDE.md「デザイン」）をこのカードで満たす：**
 * - (a) 1カードに必ず図（ミニ数直線）が1つ入る
 * - (b) 金額は Shippori Mincho 20px の独立行に出し、**文章の中に埋めない**
 * - (c) 判定バッジはカード右上の固定位置。縦に走査すれば色と位置だけで読める
 *
 * ミニ数直線は `docs/design-mock/result.html` STEP 4 の数直線の縮小版で、
 * **帯（橙）＝必要額の幅・縦線（黒）＝いまの受け皿**という対応を変えない。
 *
 * **金額はここで作らない。** 受け取った文字列を描くだけ（CLAUDE.md「本番UIに金額をハードコードしない」）。
 */
import Link from "next/link";
import { Fold } from "./Fold.js";
import {
  PremiseDisclosure,
  type PremiseSensitivity,
  type PremiseWeight,
} from "./PremiseDisclosure.js";
import s from "./riskTable.module.css";

/** 金額の主役2つ。ラベルは行ごとに変わる（いまの保障／いまの貯蓄） */
export interface RiskFigures {
  needLabel: string;
  needText: string;
  holdLabel: string;
  holdText: string;
}

/**
 * ミニ数直線の描画に要る値（円）。
 *
 * **軸の右端は `needHigh` と `hold` の大きいほうそのもの**にする。
 * 見栄えのために 1.15 倍した端を置くと、画面に出る目盛りが
 * 算定結果のどれでもない数字になってしまう（金額を作る場所は `src/calc` だけ）。
 */
export interface RiskScale {
  needLow: number;
  needHigh: number;
  /** 受け皿（死亡＝保障額／病気・失業＝貯蓄）。null なら未入力で判定しない */
  hold: number | null;
  /** 右端の目盛りに出す文字列。needText か holdText のどちらかと同じもの */
  axisMaxText: string;
}

export interface RiskRow {
  key: string;
  title: string;
  subtitle: string;
  /** 判定の見た目。`none` は未診断 */
  tone: "ok" | "check" | "short" | "none";
  verdictLabel: string;
  precisionLabel: string;
  /** 精度もモックどおりピル型バッジで出す。色は tokens.css の意味色に対応 */
  precisionTone: "calculated" | "statutory" | "unsupported";
  /** 計算未対応の行は null */
  figures: RiskFigures | null;
  /** 計算未対応の行は null。空の軌道だけを出す */
  scale: RiskScale | null;
  /** 所見。**2文以内**。金額はここに書かず figures に出す */
  note: string;
  /**
   * 判定を支えている前提（仕様 §5.3 の開示6点）。
   * **畳まない。** 必要額が1点に潰れる世帯では、前提が外れたときの動きが幅から読めないので、
   * ここが唯一の手がかりになる。折りたたむと開示にならない。
   */
  assumptions: { label?: string; note: string }[];
  /** 前提の重み（帯）。初期表示に出す2つのうちの1つ */
  premiseWeight: PremiseWeight | null;
  /** 前提が外れたときの判定遷移（T-E）。初期表示に出す2つのうちの1つ */
  premiseSensitivity: PremiseSensitivity | null;
  /**
   * **答えの幅の中で判定が変わるときの一文**（T-H・2026-09-23）。
   * レンジ表示の直下（露出部）に出す。**畳まない** ── 判定が動きうるという事実は、
   * 開いてもらって初めて伝わる場所に置かない
   */
  crossingNote?: string | null;
  /** 同ページ内へのアンカー、または準備中の表示 */
  link: { href: string; label: string } | { pending: string };
}

/** 両端が切れないように、描画域を 4%〜96% に寄せる */
const PAD = 4;
const SPAN = 92;

/**
 * ミニ数直線。
 *
 * **幅のないものを帯で描かない。** 必要額が1点（葬儀費用だけ）の世帯で最小幅の矩形を置くと、
 * 幅のある必要額と見分けがつかず、図が「レンジがある」と嘘をつく。
 * 点のときは**目盛り（縦のティック）**という別の描画文法に切り替える。
 * 幅の有無はこの図でいちばん意味のある情報なので、そこを丸めない。
 */
function MiniScale({ scale, label }: { scale: RiskScale; label: string }) {
  const max = Math.max(scale.needHigh, scale.hold ?? 0);
  const pct = (v: number) => (max <= 0 ? PAD : PAD + (v / max) * SPAN);
  const left = pct(scale.needLow);
  const width = pct(scale.needHigh) - left;
  // 1% 未満は 390px でも潰れて読めない。そこから下は帯ではなく点として描く
  const isPoint = width < 1;

  return (
    <div className={s.scaleWrap}>
      <svg className={s.scale} height="20" role="img" aria-label={label}>
        <line className={s.axis} x1="0%" x2="100%" y1="10" y2="10" />
        {isPoint ? (
          <line className={s.needTick} x1={`${left}%`} x2={`${left}%`} y1="3" y2="17" />
        ) : (
          // **角丸と枠線を付けない。** 幅の狭い帯が「つまみ」に見え、動かせる部品と誤解される
          <rect className={s.band} x={`${left}%`} width={`${width}%`} y="5" height="10" />
        )}
        {scale.hold !== null && (
          <line
            className={s.hold}
            x1={`${pct(scale.hold)}%`}
            x2={`${pct(scale.hold)}%`}
            y1="0"
            y2="20"
          />
        )}
      </svg>
      <div className={s.scaleTicks}>
        <span>0</span>
        <span>{scale.axisMaxText}</span>
      </div>
    </div>
  );
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

            {/* (b) 金額は明朝の大サイズで主役。文章から出す */}
            {r.figures && (
              <div className={s.figures}>
                <div>
                  <p className={s.figLabel}>{r.figures.needLabel}</p>
                  <p className={s.figValue}>{r.figures.needText}</p>
                </div>
                <div>
                  <p className={s.figLabel}>{r.figures.holdLabel}</p>
                  <p className={s.figValue}>{r.figures.holdText}</p>
                </div>
              </div>
            )}

            {/*
              **答えの幅で判定が変わるときの一文**（T-H・2026-09-23 オーナー裁定）。
              レンジのすぐ下に出す。**畳まない** ── 判定が動きうるという事実を、
              開いてもらって初めて見える場所に置かない
            */}
            {r.crossingNote ? <p className={s.crossing}>{r.crossingNote}</p> : null}

            {/* (a) 図の視覚アンカー。判定が文章ではなく位置関係で読める */}
            {r.scale ? (
              <MiniScale
                scale={r.scale}
                label={`${r.title}：必要額は${r.figures?.needText ?? ""}、${r.figures?.holdLabel ?? ""}は${r.figures?.holdText ?? ""}。${r.verdictLabel}。`}
              />
            ) : (
              // 計算未対応でも**枠は見せる**。空いている場所があることを図でも伝える
              <div className={s.scaleWrap}>
                <div className={s.emptyScale}>計算未対応</div>
              </div>
            )}

            <p className={s.note}>{r.note}</p>

            {/* 判定を支えている前提（仕様 §5.3 T-A / T-E）。2カードで共通の部品 */}
            <PremiseDisclosure
              items={r.assumptions}
              sensitivity={r.premiseSensitivity}
              weight={r.premiseWeight}
            />

            <div className={s.cardFoot}>
              <span className={`${s.precision} ${s[r.precisionTone]}`}>{r.precisionLabel}</span>
              {"href" in r.link ? (
                <Link className={s.link} href={r.link.href}>
                  {r.link.label}
                </Link>
              ) : (
                // **未実装のリンク先を沈黙させない。** 押せないなら、その理由まで書く
                <span className={s.pending}>{r.link.pending}</span>
              )}
            </div>
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

      {/*
        凡例・図の読み方・精度の説明。**参照材なのでまとめて畳む**
        （2026-09-21・視覚の DoD (a)）。3項目で 828px あり、
        カードの図が終わったあとに文字だけの区間を作っていた。
        露出は件数を明示した1行、中身はそのまま（開示の規約）。
      */}
      <div className={s.legendFold}>
        <Fold count="（3点）" label="この表の読み方">
        <dl className={s.legend}>
          <dt>判定</dt>
          <dd>
            <span className={`${s.badge} ${s.ok}`}>大丈夫のめやす</span>
            <span className={`${s.badge} ${s.check}`}>圏内・要精査</span>
            <span className={`${s.badge} ${s.short}`}>備え不足の可能性</span>
            <span className={`${s.badge} ${s.none}`}>未診断</span>
          </dd>
          <dt>図の読み方</dt>
          <dd className={s.legendText}>
            <span className={s.swatchBand} />
            帯が必要額の幅（幅が無いときは
            <span className={s.swatchTick} />
            の目盛り）、
            <span className={s.swatchHold} />
            縦線がいまの受け皿（保障・貯蓄）です。<strong>カードごとに目盛りが違います</strong>
            ──左端は0円、右端は必要額と受け皿の大きいほうです。
          </dd>
          <dt>精度</dt>
          <dd className={s.legendText}>
            「計算済み」はあなたの回答からの試算、「制度式で概算」は公的制度の計算式どおりの概算、
            「計算未対応」は正直な空欄です。
          </dd>
        </dl>
        </Fold>
      </div>
    </section>
  );
}
