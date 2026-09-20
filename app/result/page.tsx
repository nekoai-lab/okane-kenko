/**
 * 結果画面 v1（AIなし・T-05a）
 *
 * サーバコンポーネント。URL の区分コードを decode →（params を読んで）normalize → diagnose。
 * 数値は src/calc でしか作らない（責務境界）。ここは算定結果を「因数分解して見せる」だけ。
 * 芯：概算・要精査／前提／出典を必ず添える。減らせる箇所は無ければ「見つかりませんでした」と明示する。
 */
import Link from "next/link";
import { diagnose } from "../../src/calc/index.js";
import type { DeathResult, EducationPlan } from "../../src/calc/types.js";
import type { Projection } from "../../src/calc/projection.js";
import { coverageCurve, projectDeath } from "../../src/calc/projection.js";
import { narrate, placeholderValues } from "../../src/narrate/narrate.js";
import { jstYear } from "../../src/time/jstYear.js";
import { Cashflow } from "./Cashflow.js";
import { CoverageCurve } from "./CoverageCurve.js";
import { GapWaterfall } from "./GapWaterfall.js";
import { LivingCostSlider } from "./LivingCostSlider.js";
import { Narration } from "./Narration.js";
import type { Vital } from "./Vitals.js";
import { Vitals } from "./Vitals.js";
import { loadParams, v } from "../../src/params/index.js";
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

/**
 * 金額の呼び名は verdict で変える。**同じ数字ではないから。**
 * shortage＝足りない額／sufficient＝万一直後の当座資金／ample・not_needed＝葬儀・予備費。
 * ここを「必要な保障額」で統一すると、収入が支出を上回っているのに額が出る理由が
 * 読者に分からず、グラフと結論が矛盾して見える（2026-08-30 の実物レビューで発覚）。
 */
const AMOUNT_LABEL: Record<string, string> = {
  shortage: "足りない保障額の目安",
  sufficient: "万一の直後に要る当座資金の目安",
  ample: "葬儀・予備費の目安",
  not_needed: "葬儀・予備費の目安",
};

const AMOUNT_NOTE: Record<string, string> = {
  shortage: "※ 見込みの支出から、受け取れる収入・資産を差し引いた不足分です。",
  sufficient:
    "※ 収入・資産で支出はまかなえる見込みです。これは不足額ではなく、手続きや当面の暮らしのために手元に置いておく目安（葬儀・予備費と生活費1〜2年分）です。",
  ample: "※ 収入・資産が支出を大きく上回る見込みです。上乗せの保障は要りません。",
  not_needed: "※ 扶養するご家族がいないため、大きな死亡保障は要りません。",
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

/* いちばん細い年の1行表示（TightestYear）は Cashflow に統合した（2026-08-31）。
   同じことを2か所に書くと、片方だけ直したときに食い違う。 */

function CaseCard({
  title,
  r,
  pj,
  coverage,
}: {
  title: string;
  r: DeathResult;
  pj: Projection;
  /** いまの死亡保障額。分からない（未入力）なら null */
  coverage: number | null;
}) {
  const verdict = VERDICT[r.verdict] ?? VERDICT.sufficient;
  const expenseItems = [
    { label: "ご家族の生活費（子育て期）", amount: r.expense.livingChild, basis: "当社基準" },
    { label: "ご家族の生活費（末子独立後）", amount: r.expense.livingAlone, basis: "当社基準" },
    {
      label: "教育費",
      amount: r.expense.education,
      basis: "文科省 子供の学習費調査（塾・部活・行事・制服も含む実支出）",
    },
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
      <h2 className={s.h2}>{title}</h2>
      <div
        className={`${s.verdictLine} ${verdict.tone === "good" ? s.good : verdict.tone === "warn" ? s.warn : ""}`}
      >
        {verdict.label}
      </div>

      {/* **数字の意味は verdict で入れ替わる。** 不足のときは「足りない額」だが、
          収入が支出を上回るときは「万一直後の当座資金（葬儀費＋生活費1〜2年分）」を出している
          （death.ts の sufficient 分岐）。同じ名前で呼ぶと、グラフと結論が矛盾して見える。 */}
      <div className={s.amount}>
        {AMOUNT_LABEL[r.verdict] ?? AMOUNT_LABEL.sufficient}：
        {formatRange(r.range.low, r.range.high)}
      </div>
      <p className={s.basis}>{AMOUNT_NOTE[r.verdict] ?? AMOUNT_NOTE.sufficient}</p>

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

      {/* 年次キャッシュフロー。**総額の引き算より先に「いつ苦しいか」に答える。**
          projectDeath() は全年分を返しているのに、以前はここで1文しか出していなかった */}
      <Cashflow caption={title} pj={pj} />

      {/* 必要保障額の推移。点（今日いくら）ではなく線（いつまでいくら）で見せる */}
      <CoverageCurve coverage={coverage} points={coverageCurve(pj, r.income.assets)} />

      {/* 主グラフ：支出の合計から受け取れるものを順に引き、残りを見せる。
          「なぜこの金額か」を文章ではなく手続きで答える（2026-08-30 の方針変更）。
          引く項目は下の内訳表と1対1で、色の印も対応させている */}
      <GapWaterfall
        caption={`支出から、受け取れるものを引く（${title}・万円）`}
        expenseTotal={r.expense.total}
        income={incomeItems}
        verdict={r.verdict}
      />

      {/* 因数分解の2表は**畳む**（第3層）。結論と根拠の図までで足りる人が大半で、
          常時展開しておくと画面が「縦の羅列」に戻る。開けば同じ情報がすべてある */}
      <details className={s.criteria}>
        <summary>金額の内訳を見る（支出・収入）</summary>

        <h3 className={s.h3}>どうしてこの金額？ ─ 見込みの支出</h3>
        <div className={s.rows}>
          {expenseItems.map((x, i) => (
            <div className={s.row} key={x.label}>
              <span className={s.rowLabel}>
                <span>
                  <span
                    aria-hidden="true"
                    className={s.swatch}
                    style={{ background: `var(--chart-expense-${Math.min(i + 1, 5)})` }}
                  />
                  {x.label}
                </span>
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

        <h3 className={s.h3}>受け取れる見込みの収入・資産</h3>
        <div className={s.rows}>
          {incomeItems.map((x, i) => (
            <div className={s.row} key={x.label}>
              <span className={s.rowLabel}>
                <span>
                  <span
                    aria-hidden="true"
                    className={s.swatch}
                    style={{ background: `var(--chart-income-${Math.min(i + 1, 5)})` }}
                  />
                  {x.label}
                </span>
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
            <h3 className={s.h3}>推定で補った前提</h3>
            <ul className={s.assumptions}>
              {r.assumptions.map((a) => (
                <li key={a.field}>{a.note}</li>
              ))}
            </ul>
          </>
        )}
      </details>
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

  // 年次キャッシュフロー（US-04b）。総額と同じ係数・同じ前提で、合計する前の姿を出す。
  // 変動率は既定の0（実値への切り替えはパラメータ版の更新でやる。SPEC 参照）。
  const asOfYear = jstYear(new Date());
  const base = {
    children: input.children,
    housing: input.housing,
    assets: input.assets,
    monthlyLiving: input.monthlyLiving,
    educationPlan: input.educationPlan,
  };
  const selfProjection = projectDeath(
    params,
    { ...base, deceased: input.self, survivor: input.spouse, currentCoverage: input.coverageSelf },
    { asOfYear },
  );
  const spouseProjection = input.spouse
    ? projectDeath(
        params,
        {
          ...base,
          deceased: input.spouse,
          survivor: input.self,
          currentCoverage: input.coverageSpouse ?? null,
        },
        { asOfYear },
      )
    : null;

  const anyPending = [result.self.gap, result.spouse?.gap].some((g) => g?.kind === "pending");
  const h = anyPending ? null : (HEADLINE[result.householdHeadline.kind] ?? HEADLINE.shortage);

  // 減らせる箇所（無ければ「見つかりませんでした」と明示する＝沈黙で誤解させない）
  const totalExcess = result.householdHeadline.totalExcess;
  const totalShortage = result.householdHeadline.totalShortage;

  /**
   * 検査値パネル（拾い読みの入口）。
   *
   * **判定はここに置かない。** すぐ上の h1 が結論そのもので、繰り返しになる。
   * ここは測定値だけにして4つの性格をそろえ、「目安の額 → いまの保障 → 過不足 → 時期」
   * の順に並べる。**同じ内容はすべて下の本文と図が根拠つきで持っている。**
   *
   * ラベルには必ず「あなた」「世帯」のどちらかを書く。範囲が混ざったまま数字を並べると、
   * どこの話をしているのか読み手に分からない。
   *
   * **色を付けるのは過不足のセルだけ。** 年のセルにも色を付けてみたが、4つのうち2つが
   * 色付きになると、どれが要点か分からなくなった。年が重い事実であることは言葉が伝える。
   */
  const selfCurve = coverageCurve(selfProjection, result.self.income.assets);
  const cov = input.coverageSelf;
  const coveredFrom = cov === null ? null : (selfCurve.find((pt) => pt.need <= cov) ?? null);
  const tightest = selfProjection.tightest;
  /**
   * この診断が前提にした「いまの家計」。
   *
   * **新しい算定はしていない。入力を読み返しているだけ。**
   * FPの実務資料が例外なく「まずは現状把握が大切です」から始めるのは、
   * 前提が違えば結論も違うから。ここに出しておけば、入力の取り違えに本人が気づける。
   */
  const household: Vital[] = [
    {
      label: "世帯の年収（額面）",
      value: `約${money(input.self.income + (input.spouse?.income ?? 0))}`,
      note: input.spouse ? "ご本人＋配偶者" : "ご本人のみ",
    },
    {
      label: "毎月の生活費",
      value: `約${Math.round(input.monthlyLiving / 10000)}万円`,
      note: "ご申告または年収からの推定",
    },
    { label: "金融資産", value: `約${money(input.assets)}`, note: "貯蓄・運用の合計" },
    {
      label: "住まい",
      value:
        input.housing.type === "rent"
          ? "賃貸"
          : (input.housing.loan ?? 0) > 0
            ? "持ち家（ローンあり）"
            : "持ち家（ローンなし）",
      note:
        input.housing.type === "own" && (input.housing.loan ?? 0) > 0
          ? // 団信は初出で1行注釈を付ける（CLAUDE.md）。ここが結果画面での初出になる
            `残り約${money(input.housing.loan ?? 0)}／団信（亡くなるとローンが消える保険）${input.housing.danshin === false ? "なし" : "あり"}`
          : "住居費は生活費に含めています",
    },
  ];

  /**
   * 世帯の過不足を1枚で出す。**足りない側と減らせる側が同時にあるなら、両方を名指しする。**
   *
   * 以前は `totalShortage > 0` なら不足額だけを出していた。組み替えで済む世帯
   * （本人が過剰・配偶者が不足）では、見出しが「世帯全体で見直せそうです」なのに
   * 目が最初に行く場所には不足額だけがオレンジで立っていて、**結論と逆のことを言っていた**。
   * 大きく出すのは額の大きい側（＝その世帯で効く側）にし、もう一方は必ず注記に残す。
   */
  const gapVital: Vital =
    cov === null && result.spouse === null
      ? { label: "世帯の過不足", value: "—", note: "いまの保障が分かれば出せます" }
      : totalShortage > 0 && totalExcess > 0
        ? totalExcess >= totalShortage
          ? {
              label: "減らせる額（世帯）",
              value: `約${money(totalExcess)}`,
              note: `一方で約${money(totalShortage)}足りません。組み替えで対応できる見込みです`,
              tone: "good",
            }
          : {
              label: "足りない額（世帯）",
              value: `約${money(totalShortage)}`,
              note: `別のところで約${money(totalExcess)}減らせます`,
              tone: "warn",
            }
        : totalShortage > 0
          ? {
              label: "足りない額（世帯）",
              value: `約${money(totalShortage)}`,
              note: "いまの保障との差",
              tone: "warn",
            }
          : totalExcess > 0
            ? {
                label: "減らせる額（世帯）",
                value: `約${money(totalExcess)}`,
                note: "保険料が浮きます",
                tone: "good",
              }
            : { label: "世帯の過不足", value: "0円", note: "過不足なし", tone: "good" };

  const vitals: Vital[] = [
    {
      // 金額の呼び名は verdict で変える（同じ名前で別の数を出さない・2026-08-30 の修正と同じ理由）
      label: `${AMOUNT_LABEL[result.self.verdict] ?? AMOUNT_LABEL.sufficient}（あなた）`,
      value: formatRange(result.self.range.low, result.self.range.high),
      note: "下の内訳が根拠です",
    },
    {
      label: "いまの保障（あなた）",
      value: cov === null ? "未入力" : `約${money(cov)}`,
      note: cov === null ? "証券が見つかったら再診断できます" : "ご申告の死亡保障額",
    },
    gapVital,
    selfProjection.depletedAt
      ? {
          label: "貯蓄が尽きる年",
          value: `${selfProjection.depletedAt.year}年ごろ`,
          note: "この前提のままだと",
        }
      : coveredFrom
        ? {
            label: "いまの保障で足りる年",
            value: `${coveredFrom.year}年ごろ`,
            note: "これ以降は上乗せ不要の見込み",
          }
        : {
            label: "いちばん細い年",
            value: tightest ? `${tightest.year}年ごろ` : "—",
            note: tightest ? "その年の収支がいちばん小さい" : "算定期間が短いため出せません",
          },
  ];

  // 進路 what-if（子がいる世帯だけ）：公立/私立で必要額（あなた）がどう変わるか
  const eduWhatIf =
    input.children.length > 0
      ? (
          [
            ["public", "公立中心"],
            ["mixed", "私立混在"],
            ["private", "私立中心"],
          ] as [EducationPlan, string][]
        ).map(([plan, label]) => {
          // 進路で直接変わるのは教育費。必要額のレンジは verdict で意味が変わり
          // 単純比較できない（sufficient=上乗せ目安 / shortage=不足額）ので、
          // ここでは比較可能な「教育費」を並べる。
          const r = diagnose(params, { ...input, educationPlan: plan });
          return { label, education: r.self.expense.education };
        })
      : [];

  return (
    <main className={s.page}>
      {h ? (
        <div className={`${s.headline} ${h.tone === "good" ? s.good : s.warn}`}>
          <span className={s.icon} aria-hidden="true">
            {h.icon}
          </span>
          {/* 結論をそのまま h1 にする。読み上げでも最初に結論が来る */}
          <h1 className={s.h1}>{h.label}</h1>
        </div>
      ) : (
        <div className={`${s.headline} ${s.pending}`}>
          <span className={s.icon} aria-hidden="true">
            ℹ
          </span>
          <h1 className={s.h1}>
            いまの保険内容が分からないので、過不足はまだ出していません。必要な保障額の目安だけお見せします。証券が見つかったら再診断できます。
          </h1>
        </div>
      )}

      {/* 検査値パネル。健康診断書がまず数値の表を出すのと同じ順序にする */}
      <div className={s.wide}>
        <Vitals items={vitals} />
      </div>

      <p className={s.meta}>
        これは<strong>概算・要精査</strong>です／算定基準日：{new Date().toISOString().slice(0, 10)}
        ／使用パラメータ版：{result.paramVersion}
      </p>

      {/* やさしい説明（T-07）。数値はAIに書かせず算定結果を差し込む。
          鍵が無ければ AI を呼ばず、テンプレのまま出す（AIを止めても成立する） */}
      <Narration
        aiEnabled={Boolean(process.env.GEMINI_API_KEY)}
        initialText={narrate(result).text}
        query={q.toString()}
        values={placeholderValues(result)}
      />

      {/* この診断が前提にした「いまの家計」。前提が違えば結論も違うので、
          本人が取り違えに気づけるようにしておく（FPの「まず現状把握」にあたる） */}
      <div className={`${s.section} ${s.sectionMajor}`}>
        <h2 className={s.h2}>この診断が前提にした、いまの家計</h2>
        {/* こちらは文章の列に収まる位置なので2×2にする。720px幅で4列にすると
            「世帯の年収（額面）」のようなラベルが潰れる */}
        <Vitals items={household} twoColumns />
        <p className={s.basis}>
          違っていたら{" "}
          <Link className={s.link} href={`/wizard?${q.toString()}`}>
            入力をやり直せます
          </Link>
          。前提が変われば結論も変わります。
        </p>
      </div>

      {/* この診断で分かること／分からないこと（先に線を引く・T-06） */}
      <div className={s.section}>
        <div className={s.scope}>
          <p>
            <strong>この診断で分かること：</strong>{" "}
            あなたに万一のとき、遺されたご家族の生活・教育・住まいに必要なお金と、いまの保険との過不足の目安です。
          </p>
          <p>
            <strong>この診断で分からないこと（扱いません）：</strong>{" "}
            家計全体の最適化、就業不能・介護・学資などの個別の備え、具体的な保険商品の良し悪し。ここは線を引いています。
          </p>
        </div>
      </div>

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

      {/* 因数分解（本人・配偶者）
          **全幅にはしない。** 一度広げてみたが、SVG は viewBox で伸縮するので
          図を広げると軸の文字まで拡大されて崩れる。30本の棒も6列の表も720pxで足りており、
          実際に幅を必要としていたのは検査値パネル（4列）だけだった。 */}
      <div className={`${s.section} ${s.sectionMajor}`}>
        <CaseCard
          coverage={input.coverageSelf}
          pj={selfProjection}
          r={result.self}
          title="あなたが亡くなった場合"
        />
        {/* 配偶者側は**要約1行＋開閉**にする。
            同じ長さのカードが2つ続くと、体感の長さが倍になって読まれなくなる。
            ただしタブにはしない ── 世帯の結論（rebalanceable）は両方を見ないと意味が伝わらず、
            タブだと片方が最後まで見られない可能性がある。
            **閉じていても判定と金額は要約に出す**ので、結論そのものは必ず届く。 */}
        {result.spouse && spouseProjection && (
          <details className={s.spouseCase}>
            <summary className={s.spouseSummary}>
              <span className={s.spouseSummaryTitle}>配偶者が亡くなった場合</span>
              {/* **判定と過不足を並べない。** verdict（必要額の大きさ）と gap（いまの保障との差）は
                  別の話なので、つなげると「十分に足りています／約200万円 足りていません」のような
                  矛盾した1行になる（実際になった）。要約では行動につながる過不足を優先し、
                  過不足が出ていないときだけ判定を出す。両方の意味は開けば書いてある。 */}
              <span className={s.spouseSummaryVerdict}>
                {result.spouse.gap.kind === "shortage"
                  ? `いまの保障より 約${money(result.spouse.gap.amount)} 足りていません`
                  : result.spouse.gap.kind === "excess"
                    ? `いまの保障は 約${money(result.spouse.gap.amount)} 減らせそうです`
                    : (VERDICT[result.spouse.verdict]?.label ?? VERDICT.sufficient.label)}
              </span>
            </summary>
            <CaseCard
              coverage={input.coverageSpouse ?? null}
              pj={spouseProjection}
              r={result.spouse}
              title="配偶者が亡くなった場合"
            />
          </details>
        )}
      </div>

      {/* 前提を動かす：生活費スライダー（当社基準・ADR-014） */}
      <div className={s.section}>
        <LivingCostSlider
          input={input}
          initialLow={result.self.range.low}
          initialHigh={result.self.range.high}
        />
      </div>

      {/* 進路 what-if（子がいる世帯だけ） */}
      {eduWhatIf.length > 0 && (
        <div className={s.section}>
          <h2 className={s.h2}>進路で教育費はこう変わる（お子さん合計）</h2>
          <div className={s.rows}>
            {eduWhatIf.map((w) => (
              <div className={s.row} key={w.label}>
                <span className={s.rowLabel}>{w.label}</span>
                <span className={s.rowAmount}>{money(w.education)}</span>
              </div>
            ))}
          </div>
          <p className={s.basis}>
            ※ 進路が未定なら公立中心で計算しています。私立にするほど教育費が増え、その分
            必要な保障額も上がります。
          </p>
        </div>
      )}

      {/* 平均の中立併記（社会的証明＝煽りにしない。平均は目標ではない） */}
      <div className={s.section}>
        <div className={s.reformNote}>
          <strong>ご参考：</strong> 世帯の死亡保険金額の平均は約
          {formatMan(v(params, "householdDeathCoverageAvg"))}
          です（生命保険文化センター）。ただし
          <strong>平均は目標ではありません</strong>
          。必要な額は世帯の前提で大きく変わります。額の大小ではなく、
          <strong>あなたの前提での必要額（上の目安）</strong>で見てください。
        </div>
      </div>

      {/* 次の一歩（T-06）。文面は保険業法の自己診断サンプル（正式レビュー前） */}
      <div className={s.section}>
        <h2 className={s.h2}>次の一歩</h2>
        {(result.householdHeadline.kind === "reducible" ||
          result.householdHeadline.kind === "rebalanceable") && (
          <p className={s.meta}>
            いまの保険は減らせる余地がありそうです。契約している保険会社・代理店の窓口で「減額（保障を下げる）」の相談ができます。
          </p>
        )}
        {result.householdHeadline.kind === "shortage" && (
          <p className={s.meta}>
            足りない可能性があります。まず、お勤め先に
            <strong>団体保険（会社を通じて入れる保険）</strong>
            があるかを、総務・人事の窓口で確認してみてください。受付時期は勤務先により異なります。
          </p>
        )}
        {result.householdHeadline.kind === "all_covered" && (
          <p className={s.meta}>いまの前提では、特に手続きは必要ありません。</p>
        )}

        {/* 選ぶ基準（もっと知りたい）。押したときだけ開く。押下記録は T-09（計測）で対応 */}
        {result.householdHeadline.kind !== "all_covered" && (
          <details className={s.criteria}>
            <summary>もっと知りたい：保険を選ぶときの基準</summary>
            <ul className={s.list}>
              <li>いくらの保障が必要か（この診断の目安）</li>
              <li>いつまで必要か（末子の独立・配偶者の年齢）</li>
              <li>毎月の保険料に無理がないか</li>
              <li>誰が被保険者か（本人／配偶者）</li>
            </ul>
            <p className={s.basis}>
              ※
              具体的な商品名・会社名・ランキングは出しません。判断はご本人と、契約する保険会社・窓口で。
            </p>
          </details>
        )}

        <p className={s.basis}>
          ※ このサービスは特定の商品を勧めたり、申込みへ誘導したりしません（制度・一般情報の提供）。
          次の一歩の案内は専門家レビュー前のサンプルです。
        </p>
      </div>

      {/* 続きを受け取る導線（T-13）。**出典より下に置かない。**
          唯一「こちらから声をかける」機能が、最下部のテキストリンク1本では見つからない。
          ただし CTA の赤は使わない。押させたい場所ではなく、選べる場所として出す。 */}
      <div className={`${s.section} ${s.watchCard}`}>
        <h2 className={s.h3}>このあと、状況が変わったら</h2>
        <p className={s.watchLead}>
          お子さんの進学など、必要な保障が変わる時期にだけ一言お知らせします。
          保存するのは今日の入力（範囲）と結果の要点だけで、
          <strong>お知らせに金額は書きません</strong>。いつでも削除できます。
        </p>
        <Link className={s.watchButton} href={`/save?${q.toString()}`}>
          この結果を保存してお知らせを受け取る
        </Link>
        <p className={s.basis}>※ 保存しなくても、この結果はURLをブックマークすれば見返せます。</p>
      </div>

      {/* 参考リンク（公的機関のみ・商品導線は置かない＝受入基準A-4） */}
      <div className={s.section}>
        <h2 className={s.h2}>参考（公的機関）</h2>
        <ul className={s.list}>
          <li>
            <a
              className={s.link}
              href="https://www.nenkin.go.jp/service/jukyu/seido/izokunenkin/jukyu-yoken/index.html"
              rel="noreferrer"
              target="_blank"
            >
              遺族年金（日本年金機構）
            </a>
          </li>
          <li>
            <a
              className={s.link}
              href="https://www.kyoukaikenpo.or.jp/g3/sb3030/"
              rel="noreferrer"
              target="_blank"
            >
              高額療養費（全国健康保険協会）
            </a>
          </li>
          <li>
            <a
              className={s.link}
              href="https://www.mext.go.jp/a_menu/shotou/mushouka/index.htm"
              rel="noreferrer"
              target="_blank"
            >
              高校生等への就学支援（文部科学省）
            </a>
          </li>
        </ul>
      </div>

      <p className={s.sources}>
        出典：遺族年金は日本年金機構・厚生年金保険法（令和8年度の年金額は報道値ベースで確定前）、教育費は文部科学省
        子供の学習費調査。生活費率・就労推定などの「当社基準」は公的出典のない当社の見立てです。
      </p>

      <div className={s.draftNote}>
        次の一歩・選ぶ基準の文面は、保険業法の正式な弁護士レビュー（OI-01）後に確定します（現在はサンプル）。
        <br />
        <Link className={s.link} href={`/wizard?${q.toString()}`}>
          入力をやり直す
        </Link>
      </div>
    </main>
  );
}
