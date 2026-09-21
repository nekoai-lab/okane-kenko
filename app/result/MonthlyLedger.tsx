/**
 * 毎月の家計台帳（仕様 §5.3 STEP2・照合表 #6a）
 *
 * **移植元は `docs/design-mock/result.html` の左カラム（`.ledger-row`）。**
 * 「金額の前に、起きることから」の担当で、**万一の翌月から何がいくら入って、いくら出るか**を出す。
 *
 * 各行に**どの回答から来たか**を付けるのがこのブロックの要点。
 * 金額が回答のどれに紐づいているかが見えないと、読み手は数字を検算できない。
 *
 * **金額はここで作らない。** `projectDeath` の初年度の行を月額に直したものを受け取るだけ。
 */
import { KeyCaption } from "./KeyCaption.js";
import s from "./step2.module.css";

export interface LedgerRow {
  label: string;
  /** どの回答から来たか（`子2人` のような**値だけ**）。`回答:` はキャプション側が付ける */
  from: string | null;
  /** 表示用の金額文字列（円は呼び出し側で整形済み） */
  value: string;
  /**
   * 金額の色。**色に意味を持たせる**（組版の規約2）：
   * `income` ＝入ってくるお金（緑）／`range` ＝幅を持つ＝推定の揺れ（橙）／`fixed` ＝確定値（ink）
   */
  tone?: "income" | "range" | "fixed";
}

export function MonthlyLedger({
  incomes,
  incomeTotal,
  expenses,
  netPrefix,
  netAmount,
  netSuffix,
  netTone,
}: {
  incomes: LedgerRow[];
  incomeTotal: string;
  expenses: LedgerRow[];
  /**
   * 差し引きを**3つに分けて受け取る**（「毎月」／金額／「残ります」）。
   * 1つの文字列だと 390px で折り返し、金額の途中や述語の1文字だけが次行に落ちる。
   * **金額は折り返さない**（`white-space: nowrap`）。
   */
  netPrefix: string;
  netAmount: string;
  netSuffix: string;
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
            {/* 出どころは**ラベルの下の行**に落とす。
                同じ行に入れると金額に食い込んで折り返し、どちらも読めなくなる */}
            {r.from && <KeyCaption label="回答" value={r.from} />}
          </span>
          <span className={`${s.ledgerValue} ${s[r.tone ?? "income"]}`}>{r.value}</span>
        </div>
      ))}
      {/* 破線＝小計の手前（罫線の文法：破線は小計、実線はセクションの区切り） */}
      <div className={`${s.ledgerRow} ${s.ledgerSum}`}>
        <span className={s.sumLabel}>計</span>
        <span className={`${s.ledgerValue} ${s.sumValue}`}>{incomeTotal}</span>
      </div>

      <div className={s.ledgerBlock}>
        <p className={s.ledgerHead}>出ていくお金</p>
        {expenses.map((r) => (
          <div className={s.ledgerRow} key={r.label}>
            <span className={s.ledgerLabel}>
              {r.label}
              {r.from && <KeyCaption label="回答" value={r.from} />}
            </span>
            <span className={`${s.ledgerValue} ${s[r.tone ?? "fixed"]}`}>{r.value}</span>
          </div>
        ))}
      </div>

      <div className={s.ledgerBlock}>
        <p className={s.tiny}>差し引き</p>
        {/* **3段組で、金額は折り返さない。** 述語の1文字だけが次行に落ちるのを防ぐ */}
        <p className={`${s.ledgerNet} ${netTone === "short" ? s.netShort : s.netOk}`}>
          <span className={s.netPrefix}>{netPrefix}</span>
          <span className={s.netAmount}>{netAmount}</span>
          <span className={s.netSuffix}>{netSuffix}</span>
        </p>
      </div>
    </div>
  );
}
