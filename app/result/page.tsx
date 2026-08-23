/**
 * 結果画面 v1（AIなし・T-05a）
 *
 * サーバコンポーネント。URL の区分コードを decode →（params を読んで）normalize → diagnose。
 * 数値は src/calc でしか作らない（責務境界）。ここは算定結果を「因数分解して見せる」だけ。
 * 芯：概算・要精査／前提／出典を必ず添える。減らせる箇所は無ければ「見つかりませんでした」と明示する。
 */
import Link from "next/link";
import { diagnose } from "../../src/calc/index.js";
import type { DeathResult } from "../../src/calc/types.js";
import { loadParams } from "../../src/params/index.js";
import { formatMan, formatRange } from "../../src/design/tokens.js";
import { toCompleteSelections } from "../../src/wizard/complete.js";
import { normalize } from "../../src/wizard/normalize.js";
import { decodeSelections } from "../../src/wizard/url.js";
import s from "./page.module.css";

const HEADLINE: Record<string, { icon: string; label: string; tone: "good" | "warn" }> = {
  all_covered: { icon: "✓", label: "いまの前提では、足りています", tone: "good" },
  reducible: { icon: "💡", label: "減らせる余地がありそうです", tone: "good" },
  rebalanceable: { icon: "🔁", label: "世帯全体で見直せそうです", tone: "good" },
  shortage: { icon: "⚠", label: "足りない可能性があります", tone: "warn" },
};

const VERDICT: Record<string, { label: string; tone: "good" | "warn" | "muted" }> = {
  shortage: { label: "いまの前提では、備えが足りない可能性があります", tone: "warn" },
  sufficient: { label: "いまの前提では、おおむね足りています", tone: "good" },
  ample: { label: "いまの前提では、十分に足りています（上乗せも不要）", tone: "good" },
  not_needed: { label: "扶養するご家族がいないため、大きな死亡保障は不要です", tone: "muted" },
};

function money(yen: number): string {
  return formatMan(yen);
}

function CaseCard({ title, r }: { title: string; r: DeathResult }) {
  const verdict = VERDICT[r.verdict] ?? VERDICT.sufficient;
  const expenseItems = [
    { label: "ご家族の生活費（子育て期）", amount: r.expense.livingChild, basis: "当社基準" },
    { label: "ご家族の生活費（末子独立後）", amount: r.expense.livingAlone, basis: "当社基準" },
    { label: "教育費", amount: r.expense.education, basis: "文科省 子供の学習費調査" },
    { label: "住居費（団信なしのローン残高）", amount: r.expense.housing, basis: "" },
    { label: "葬儀・予備費", amount: r.expense.funeral, basis: "当社基準" },
  ].filter((x) => x.amount > 0);
  const incomeItems = [
    {
      label: "遺族基礎年金",
      amount: r.income.pensionBasic,
      basis: "日本年金機構 ※令和8年度は報道値",
    },
    { label: "遺族厚生年金", amount: r.income.pensionKosei, basis: "厚生年金保険法" },
    { label: "中高齢寡婦加算", amount: r.income.chukoreiKafu, basis: "厚生年金保険法" },
    { label: "ご家族の就労収入", amount: r.income.survivorWork, basis: "当社基準" },
    { label: "金融資産", amount: r.income.assets, basis: "" },
  ].filter((x) => x.amount > 0);

  return (
    <div className={s.caseCard}>
      <h2 className={s.caseTitle}>{title}</h2>
      <div
        className={`${s.verdictLine} ${verdict.tone === "good" ? s.good : verdict.tone === "warn" ? s.warn : ""}`}
      >
        {verdict.label}
      </div>

      <div className={s.amount}>必要な保障額の目安：{formatRange(r.range.low, r.range.high)}</div>

      {/* 現在の保障との比較 */}
      {r.gap.kind === "pending" && (
        <p className={s.meta}>
          現在の保険が未入力のため、過不足の判定は保留しています。証券が見つかったら再診断できます。
        </p>
      )}
      {r.gap.kind === "shortage" && (
        <p className={s.meta}>いまの保障より、約{money(r.gap.amount)} 足りていません。</p>
      )}
      {r.gap.kind === "excess" && (
        <p className={s.meta}>いまの保障は、約{money(r.gap.amount)} 減らせそうです。</p>
      )}
      {r.gap.kind === "adequate" && (
        <p className={s.meta}>いまの保障は、過不足なく足りています。</p>
      )}

      {/* 子の年齢での時間軸（見落としの可視化） */}
      {r.years.total > 0 && (
        <div className={s.timeline}>
          {r.years.dependent > 0 ? (
            <>
              お子さんが独立する約{r.years.dependent}年後まで（子育て期）と、その後
              配偶者が65歳になるまでの約
              {r.years.alone}年を見込んでいます。<strong>独立後は必要額が下がります。</strong>
            </>
          ) : (
            <>配偶者が65歳になるまでの約{r.years.total}年を見込んでいます。</>
          )}
          <div className={s.timelineBar} aria-hidden="true">
            <div
              className={s.segDep}
              style={{ width: `${(r.years.dependent / r.years.total) * 100}%` }}
            />
            <div
              className={s.segAlone}
              style={{ width: `${(r.years.alone / r.years.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 因数分解：支出 */}
      <div className={s.subhead}>どうしてこの金額？ ─ 見込みの支出</div>
      <div className={s.rows}>
        {expenseItems.map((x) => (
          <div className={s.row} key={x.label}>
            <span className={s.rowLabel}>
              {x.label}
              {x.basis ? <span className={s.basis}>根拠：{x.basis}</span> : null}
            </span>
            <span className={s.rowAmount}>{money(x.amount)}</span>
          </div>
        ))}
        <div className={`${s.row} ${s.total}`}>
          <span>支出の合計</span>
          <span className={s.rowAmount}>{money(r.expense.total)}</span>
        </div>
      </div>

      {/* 因数分解：収入 */}
      <div className={s.subhead}>受け取れる見込みの収入・資産</div>
      <div className={s.rows}>
        {incomeItems.map((x) => (
          <div className={s.row} key={x.label}>
            <span className={s.rowLabel}>
              {x.label}
              {x.basis ? <span className={s.basis}>根拠：{x.basis}</span> : null}
            </span>
            <span className={s.rowAmount}>{money(x.amount)}</span>
          </div>
        ))}
        <div className={`${s.row} ${s.total}`}>
          <span>収入・資産の合計</span>
          <span className={s.rowAmount}>{money(r.income.total)}</span>
        </div>
      </div>

      {/* 推定で補った前提 */}
      {r.assumptions.length > 0 && (
        <>
          <div className={s.subhead}>推定で補った前提</div>
          <ul className={s.assumptions}>
            {r.assumptions.map((a) => (
              <li key={a.field}>{a.note}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(sp)) {
    if (typeof val === "string") q.set(k, val);
  }

  const sel = decodeSelections(q);
  const complete = toCompleteSelections(sel);
  if (!complete) {
    return (
      <main className={s.page}>
        <p>入力がまだ足りていないようです。</p>
        <Link className={s.link} href={`/wizard?${q.toString()}`}>
          入力に戻る
        </Link>
      </main>
    );
  }

  const params = loadParams();
  const { input } = normalize(params, complete, new Date());
  const result = diagnose(params, input);

  const anyPending = [result.self.gap, result.spouse?.gap].some((g) => g?.kind === "pending");
  const h = anyPending ? null : (HEADLINE[result.householdHeadline.kind] ?? HEADLINE.shortage);

  // 減らせる箇所（無ければ「見つかりませんでした」と明示する＝沈黙で誤解させない）
  const totalExcess = result.householdHeadline.totalExcess;

  return (
    <main className={s.page}>
      {h ? (
        <div className={`${s.headline} ${h.tone === "good" ? s.good : s.warn}`}>
          <span className={s.icon} aria-hidden="true">
            {h.icon}
          </span>
          <span>{h.label}</span>
        </div>
      ) : (
        <div className={`${s.headline} ${s.pending}`}>
          <span className={s.icon} aria-hidden="true">
            ℹ
          </span>
          <span>
            いまの保険内容が分からないので、過不足はまだ出していません。必要な保障額の目安だけお見せします。証券が見つかったら再診断できます。
          </span>
        </div>
      )}

      <p className={s.meta}>
        これは<strong>概算・要精査</strong>です／算定基準日：{new Date().toISOString().slice(0, 10)}
        ／使用パラメータ版：{result.paramVersion}
      </p>

      {/* 減らせる箇所 */}
      <div className={s.section}>
        {totalExcess > 0 ? (
          <div className={s.reduce}>
            <strong>減らせそうな箇所：</strong> 世帯全体で、いまの保障を約{money(totalExcess)}
            減らせる余地があります。保険料が浮くのは良い知らせです（いまの前提では）。
          </div>
        ) : (
          <div className={s.reduceNone}>減らせる箇所は、今回の前提では見つかりませんでした。</div>
        )}
      </div>

      {/* 2028年の年金改正の該当/非該当（事実として中立に明示） */}
      <div className={s.section}>
        <div className={s.reformNote}>
          <strong>2028年の年金改正について：</strong> {result.reform2028.reason}
        </div>
      </div>

      {/* 因数分解（本人・配偶者） */}
      <div className={s.section}>
        <CaseCard title="あなたが亡くなった場合" r={result.self} />
        {result.spouse && <CaseCard title="配偶者が亡くなった場合" r={result.spouse} />}
      </div>

      <p className={s.sources}>
        出典：遺族年金は日本年金機構・厚生年金保険法（令和8年度の年金額は報道値ベースで確定前）、教育費は文部科学省
        子供の学習費調査。生活費率・就労推定などの「当社基準」は公的出典のない当社の見立てです。
      </p>

      <div className={s.draftNote}>
        平均との比較・前提を動かすスライダー・進路による増減などは準備中です（T-05b）。
        <br />
        <Link className={s.link} href={`/wizard?${q.toString()}`}>
          入力をやり直す
        </Link>
      </div>
    </main>
  );
}
