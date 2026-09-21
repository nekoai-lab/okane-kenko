/**
 * STEP2「もしものとき、暮らしはこうなる」（仕様 §5.3・照合表 #6a〜#6e）
 *
 * 家計台帳・段差チャート・段差の説明・接続文をまとめる。
 * **金額はここで作らない。** `projectDeath` の年次配列を月額に直して渡すだけ。
 */
import type { Projection } from "../../src/calc/projection.js";
import { MonthlyLedger } from "./MonthlyLedger.js";
import { StepChart, type StepYear } from "./StepChart.js";
import s from "./step2.module.css";

const MONTHS = 12;

/**
 * 円/年 → 表示用の 月あたり万円。
 * **万円・小数1桁にする。** モックの台帳も万円表記で、`111,000円/月` のような桁の多い表示は
 * 並べたときに比べられない（この台帳は「入る合計 vs 出る合計」を見る場所）。
 */
function perMonthMan(yen: number): string {
  return `約${(yen / MONTHS / 10_000).toFixed(1)}万円`;
}

export interface Step2Props {
  pj: Projection;
  /** 遺される側の呼び名。本人死亡なら「配偶者」、配偶者死亡なら「あなた」 */
  survivorLabel: string;
  /** 各行が「どの回答から」来たか。回答に紐づかない行は null */
  from: {
    pension: string | null;
    kosei: string | null;
    work: string | null;
    housing: string | null;
  };
  /** 団信で住居費が消えているか（0円の行を出すかどうか） */
  danshinCovered: boolean;
}

export function Step2({ pj, survivorLabel, from, danshinCovered }: Step2Props) {
  const first = pj.rows[0];
  if (!first) return null;

  const rows: StepYear[] = pj.rows.map((r) => ({
    year: r.year,
    survivorAge: r.ages.survivor,
    childAges: r.ages.children,
    pension: (r.income.pensionBasic + r.income.pensionKosei + r.income.chukoreiKafu) / MONTHS,
    work: r.income.work / MONTHS,
    living: r.expense.living / MONTHS,
    education: r.expense.education / MONTHS,
    events: r.events,
  }));

  const incomes = [
    {
      label: "遺族基礎年金＋子の加算",
      from: from.pension,
      value: perMonthMan(first.income.pensionBasic),
    },
    { label: "遺族厚生年金", from: from.kosei, value: perMonthMan(first.income.pensionKosei) },
    { label: `${survivorLabel}の収入`, from: from.work, value: perMonthMan(first.income.work) },
  ].filter((r) => r.value !== "約0.0万円");

  const expenses = [
    { label: "生活費", from: null, value: perMonthMan(first.expense.living) },
    ...(danshinCovered
      ? [{ label: "住宅ローン", from: from.housing, value: "0円" }]
      : first.expense.housing > 0
        ? [{ label: "住居費", from: from.housing, value: perMonthMan(first.expense.housing) }]
        : []),
  ];

  const netMonthly = first.net / MONTHS;
  const short = netMonthly < 0;

  /**
   * 段差として出す年。**初年度は段差ではない**（`projection.ts` が「診断の起点」を入れているが、
   * それは起点であって、何かが変わった年ではない）。
   * モックの ①②③ に合わせて最大3つ。
   */
  const stepRows = rows.filter((r, i) => i > 0 && r.events.length > 0).slice(0, 3);

  return (
    <div className={s.step2}>
      <MonthlyLedger
        expenses={expenses}
        incomeTotal={perMonthMan(first.income.total)}
        incomes={incomes}
        netLabel="毎月 "
        netTone={short ? "short" : "ok"}
        netValue={
          short
            ? `${perMonthMan(Math.abs(first.net))} 足りません`
            : `${perMonthMan(first.net)} 残ります`
        }
      />

      <StepChart
        caption={`${rows[0].year}年から${rows[rows.length - 1].year}年までの、公的年金・就労収入・生活費の推移。単位は月あたりの円。`}
        rows={rows}
        stepYears={stepRows.map((r) => r.year)}
        survivorLabel={survivorLabel}
      />

      {/*
        段差の説明。**西暦＋年齢＋制度の部品名**で書く（仕様の完了条件）。
        「何が起きて、いくらからいくらへ」まで出す ── 段差の高さが読めないと、図が絵で終わる。
      */}
      <ol className={s.steps}>
        {stepRows.map((r, i) => {
          const prev = rows[rows.indexOf(r) - 1];
          const man = (v: number) => (v / 10_000).toFixed(1);
          const pensionMoved = prev !== undefined && Math.abs(prev.pension - r.pension) >= 1000;
          return (
            <li className={s.stepItem} key={r.year}>
              <span className={s.stepBadge}>{i + 1}</span>
              <div>
                <p className={s.stepWhen}>
                  {r.year}年{r.survivorAge !== null && `・${survivorLabel}${r.survivorAge}歳`}
                  {r.childAges.length > 0 && `／お子さん${r.childAges.join("・")}歳`}
                </p>
                <p className={s.stepWhat}>
                  {r.events.join("／")}
                  {/* **動いていない額を「◯から◯へ」と書かない。** 段差の無い年もあるため */}
                  {pensionMoved && (
                    <>
                      。公的年金は月{man(prev.pension)}万円から{man(r.pension)}万円へ
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className={s.bridge}>
        この「毎月の不足」と「教育費の山」を、算定期間の全部で足し合わせたものが、次の STEP&nbsp;3
        の「必要な総額」です。
      </p>
    </div>
  );
}
