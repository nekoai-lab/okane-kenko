/**
 * STEP3 滝グラフ（仕様 §5.3・照合表 #7）
 *
 * **移植元は `docs/design-mock/result.html` の `#wfRows`。**
 * 総額から、公的なしくみと家計でまかなえる分を順に引き、残りが民間保険で備える額。
 *
 * **モックの滝は不足世帯のサンプルで描かれている。** 余剰が出る世帯（`ample`）に
 * そのまま当てると棒がマイナスに突き抜け、ヒーローの必要額と突き合わなくなる。
 * この実装は2点だけ改変する（2026-09-21 オーナー承認）：
 *
 * 1. **控除の棒は0で止める。** 引ききれなかった分は負に伸ばさず、別の行にする
 *    （棒を負に伸ばすと「必要額がマイナス」と読める）
 * 2. **余った分を別色で立てる**。その棒には**どの前提の上に乗っている余りか**を脚注で書く
 *
 * **金額はここで作らない。** 受け取った額を描くだけ。
 */
import { KeyCaption } from "./KeyCaption.js";
import s from "./waterfall.module.css";

export interface WaterfallDeduction {
  label: string;
  /** どの回答から来たか（値だけ）。`回答:` はキャプション側が付ける */
  from: string | null;
  /** 回答ではない導出の説明（「手取りに換算し…」など）。キャプションにしない */
  note?: string;
  /** 出典（機関名）。無ければ null */
  source: string | null;
  /** 控除額（円） */
  amount: number;
}

export interface WaterfallProps {
  /** 必要な総額（円） */
  total: number;
  totalLabel: string;
  totalFrom: string;
  deductions: WaterfallDeduction[];
  /** 表示用の整形（円 → 文字列）。画面で桁を作らないため呼び出し側から渡す */
  fmt: (yen: number) => string;
  /** 最終行。T-B でレンジになるので、いまから low/high で受ける */
  result: { low: number; high: number; label: string; note: string };
  /** 余りが出たときの脚注（どの前提の上に乗っている余りか） */
  surplusNote: string;
  /** 住居費0円などの理由行 */
  footnote: string | null;
}

export function Waterfall({
  total,
  totalLabel,
  totalFrom,
  deductions,
  fmt,
  result,
  surplusNote,
  footnote,
}: WaterfallProps) {
  const pct = (yen: number) => (total <= 0 ? 0 : Math.max(0, Math.min(100, (yen / total) * 100)));

  // 引ききれた分だけを棒にする。残りを超える控除は、超過分を「余る分」に回す
  let remaining = total;
  const bars = deductions.map((d) => {
    const used = Math.min(d.amount, remaining);
    const left = remaining - used;
    remaining -= used;
    return { ...d, used, left, unusedPart: d.amount - used };
  });
  const surplus = deductions.reduce((sum, d) => sum + d.amount, 0) - total;

  return (
    <div className={s.wf}>
      <div className={s.legend}>
        <span>
          <i className={s.lgCover} />
          公的年金・家計でまかなえる分
        </span>
        <span>
          <i className={s.lgNeed} />
          民間保険で備える額
        </span>
        {surplus > 0 && (
          <span>
            <i className={s.lgSurplus} />
            余る分
          </span>
        )}
      </div>

      <ol className={s.rows}>
        <li className={s.row}>
          <div className={s.head}>
            <p className={s.label}>{totalLabel}</p>
            <p className={s.amount}>{fmt(total)}</p>
          </div>
          <p className={s.from}>
            {/* 回答でも出典でもない導出の説明。キャプションと同じ薄さにそろえる */}
            <span className={s.note}>{totalFrom}</span>
          </p>
          <div className={s.track}>
            <span className={`${s.bar} ${s.barTotal}`} style={{ left: "0%", width: "100%" }} />
          </div>
        </li>

        {bars.map((d, i) => (
          <li className={s.row} key={d.label}>
            <div className={s.head}>
              <p className={s.label}>{d.label}</p>
              <p className={`${s.amount} ${s.amountCover}`}>▲{fmt(d.amount)}</p>
            </div>
            <p className={s.from}>
              {d.from && <KeyCaption label="回答" value={d.from} />}
              {d.source && <KeyCaption label="出典" value={d.source} />}
              {d.note && <span className={s.note}>{d.note}</span>}
            </p>
            <div className={s.track}>
              <span
                className={`${s.bar} ${s[`cover${Math.min(i + 1, 3)}` as keyof typeof s]}`}
                style={{ left: `${pct(d.left)}%`, width: `${pct(d.used)}%` }}
              />
            </div>
            {/* **引ききれなかった分を黙らせない。** その分が下の「余る分」になる */}
            {d.unusedPart > 0 && (
              <p className={s.overflow}>
                {d.used === 0
                  ? // 棒が出ない行。**「このうち」と書くと一部に読める**ので、全額だと書く
                    `この全額が、総額を超えたぶんです（下の「余る分」へ）`
                  : `このうち ${fmt(d.unusedPart)} は、総額を超えたぶんです（下の「余る分」へ）`}
              </p>
            )}
          </li>
        ))}

        {surplus > 0 && (
          <li className={s.row}>
            <div className={s.head}>
              <p className={s.label}>余る分</p>
              <p className={`${s.amount} ${s.amountSurplus}`}>{fmt(surplus)}</p>
            </div>
            <div className={s.track}>
              <span
                className={`${s.bar} ${s.barSurplus}`}
                style={{ left: "0%", width: `${pct(surplus)}%` }}
              />
            </div>
            {/* 余りがどの前提の上に乗っているかを、棒の隣で言う */}
            <p className={s.surplusNote}>{surplusNote}</p>
          </li>
        )}

        <li className={`${s.row} ${s.rowResult}`}>
          <div className={s.head}>
            <p className={`${s.label} ${s.labelResult}`}>= {result.label}</p>
            <p className={`${s.amount} ${s.amountNeed}`}>
              {result.low === result.high
                ? fmt(result.low)
                : `${fmt(result.low)}〜${fmt(result.high)}`}
            </p>
          </div>
          <div className={s.track}>
            {/*
              **幅のないものを帯で描かない**（診断表のミニ数直線と同じ文法）。
              T-B でレンジが復活したら帯になる。いまは1点なので目盛りで描く。
            */}
            {result.low === result.high ? (
              <span className={`${s.bar} ${s.barNeedTick}`} style={{ left: `${pct(result.low)}%` }} />
            ) : (
              <span
                className={`${s.bar} ${s.barNeed}`}
                style={{
                  left: `${pct(result.low)}%`,
                  width: `${pct(result.high - result.low)}%`,
                }}
              />
            )}
          </div>
          <p className={s.resultNote}>{result.note}</p>
        </li>
      </ol>

      {footnote && <p className={s.footnote}>{footnote}</p>}
    </div>
  );
}
