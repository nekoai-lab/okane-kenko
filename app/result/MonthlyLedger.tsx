/**
 * 毎月の家計台帳（仕様 §5.3 STEP2・照合表 #6a）
 *
 * **移植元は `docs/design-mock/result.html` の左カラム（`.ledger-row`）。**
 * 「金額の前に、起きることから」の担当で、**万一の翌月から何がいくら入って、いくら出るか**を出す。
 *
 * 各行に**「←どの回答から」**を付けるのがこのブロックの要点。
 * 金額が回答のどれに紐づいているかが見えないと、読み手は数字を検算できない。
 *
 * **金額はここで作らない。** `projectDeath` の初年度の行を月額に直したものを受け取るだけ。
 */
import s from "./step2.module.css";

export interface LedgerRow {
  label: string;
  /** 「←『子2人』から」のような、どの回答から来たかの1行 */
  from: string | null;
  /** 表示用の金額文字列（円は呼び出し側で整形済み） */
  value: string;
}

export function MonthlyLedger({
  incomes,
  incomeTotal,
  expenses,
  netLabel,
  netValue,
  netTone,
}: {
  incomes: LedgerRow[];
  incomeTotal: string;
  expenses: LedgerRow[];
  netLabel: string;
  netValue: string;
  /** 差し引きが足りていれば `ok`、足りなければ `short` */
  netTone: "ok" | "short";
}) {
  return (
    <div className={s.ledger}>
      <p className={s.ledgerTitle}>毎月の家計 — 万一の翌月から</p>
      <p className={s.tiny}>最初の1年のすがた。その先の段差は下のグラフへ。</p>

      <p className={s.ledgerHead}>入ってくるお金</p>
      {incomes.map((r) => (
        <div className={s.ledgerRow} key={r.label}>
          <span className={s.ledgerLabel}>
            {r.label}
            {/* 「←どの回答から」は**ラベルの下の行**に落とす。
                同じ行に入れると金額に食い込んで折り返し、どちらも読めなくなる */}
            {r.from && <span className={s.ledgerFrom}>←{r.from}から</span>}
          </span>
          <span className={s.ledgerValue}>{r.value}</span>
        </div>
      ))}
      <div className={`${s.ledgerRow} ${s.ledgerSum}`}>
        <span>計</span>
        <span className={s.ledgerValue}>{incomeTotal}</span>
      </div>

      <div className={s.ledgerBlock}>
        <p className={s.ledgerHead}>出ていくお金</p>
        {expenses.map((r) => (
          <div className={s.ledgerRow} key={r.label}>
            <span className={s.ledgerLabel}>
              {r.label}
              {r.from && <span className={s.ledgerFrom}>←{r.from}から</span>}
            </span>
            <span className={s.ledgerValue}>{r.value}</span>
          </div>
        ))}
      </div>

      <div className={s.ledgerBlock}>
        <p className={s.tiny}>差し引き</p>
        <p className={`${s.ledgerNet} ${netTone === "short" ? s.netShort : s.netOk}`}>
          {netLabel}
          <strong>{netValue}</strong>
        </p>
      </div>
    </div>
  );
}
