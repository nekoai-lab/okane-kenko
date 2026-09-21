/**
 * 結果画面 v1（AIなし・T-05a）
 *
 * サーバコンポーネント。URL の区分コードを decode →（params を読んで）normalize → diagnose。
 * 数値は src/calc でしか作らない（責務境界）。ここは算定結果を「因数分解して見せる」だけ。
 * 芯：概算・要精査／前提／出典を必ず添える。減らせる箇所は無ければ「見つかりませんでした」と明示する。
 */
import Link from "next/link";
import type { DiagnoseInput } from "../../src/calc/index.js";
import { diagnose, toHousehold } from "../../src/calc/index.js";
import type { DeathResult, EducationPlan } from "../../src/calc/types.js";
import type { Projection } from "../../src/calc/projection.js";
import { coverageCurve, projectDeath } from "../../src/calc/projection.js";
import { narrate, placeholderValues } from "../../src/narrate/narrate.js";
import { jstYear } from "../../src/time/jstYear.js";
import { dialFor, simulateAll } from "../../src/calc/simulate.js";
import { survivorIncomeSensitivity } from "../../src/calc/sensitivity.js";
import { decisionPoints } from "../../src/calc/decisionPoints.js";
import { reform2028 } from "../../src/calc/reform2028.js";
import { householdSummary, verdict3 } from "../../src/calc/verdict3.js";
import { Hero } from "./Hero.js";
import { LivingDial } from "./LivingDial.js";
import { RiskTable, type RiskRow } from "./RiskTable.js";
import { Step1, type AnswerChip } from "./Step1.js";
import { UsedSources, type UsedSource } from "./UsedSources.js";
import { Step2 } from "./Step2.js";
import { CoverageCurve } from "./CoverageCurve.js";
import { NumberLine } from "./NumberLine.js";
import { Waterfall } from "./Waterfall.js";
import { Narration } from "./Narration.js";
import { loadParams, v } from "../../src/params/index.js";
import { formatMan, formatRange } from "../../src/design/tokens.js";
import { toCompleteSelections } from "../../src/wizard/complete.js";
import type { Estimation } from "../../src/wizard/types.js";
import { normalize } from "../../src/wizard/normalize.js";
import { LIVING_LEVELS, decodeLivingLevel, withLivingLevel } from "../../src/wizard/dial.js";
import { decodeSelections } from "../../src/wizard/url.js";
import s from "./page.module.css";

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

/**
 * 滝グラフの最終行に添える1文。
 *
 * **`ample` の「葬儀・予備費だけは残す」に、時期の根拠は仕様に無い。**
 * `機能仕様書_MVP.md` §4.2.7 の `ample` 分岐は `提示レンジ = [round100(E4), round100(E4)]` の
 * 床ルールで、ADR にも `当座` `直後` `流動性` の記載が1件も無い（2026-09-21 に全文確認）。
 * だから「受け取りは長い年月をかけて入るから」とは書かない ──
 * **もっともらしい理由を後付けしない。当社基準だと正直に書く。**
 */
/** 最終行の括弧。額の性質が verdict で入れ替わるので、名前だけでは足りない */
const RESULT_QUALIFIER: Record<string, string> = {
  shortage: "",
  sufficient: "（葬儀・予備費と当座の生活費）",
  ample: "（葬儀・予備費のみ）",
  not_needed: "（葬儀・予備費のみ）",
};

const RESULT_NOTE: Record<string, string> = {
  shortage: "見込みの支出から、受け取れる収入・資産を差し引いた残りです。",
  sufficient:
    "収入・資産で支出はまかなえる見込みです。これは不足額ではなく、手続きや当面の暮らしのために手元に置いておく目安（葬儀・予備費と生活費1〜2年分）です。",
  ample:
    "公的な年金と資産が総額を上回るため、生活費のための上乗せは0円です。それでも葬儀・予備費を残しているのは、余剰があってもこの分だけは別に備えるという当社基準で、時期の根拠は置いていません。",
  not_needed:
    "扶養するご家族がいないため、上乗せの保障は要りません。残るのは葬儀・予備費だけです。",
};

const AMOUNT_NOTE: Record<string, string> = {
  shortage: "※ 見込みの支出から、受け取れる収入・資産を差し引いた不足分です。",
  sufficient:
    "※ 収入・資産で支出はまかなえる見込みです。これは不足額ではなく、手続きや当面の暮らしのために手元に置いておく目安（葬儀・予備費と生活費1〜2年分）です。",
  ample: "※ 収入・資産が支出を大きく上回る見込みです。上乗せの保障は要りません。",
  not_needed: "※ 扶養するご家族がいないため、大きな死亡保障は要りません。",
};

/**
 * **過不足軸**（`Verdict3`）のラベルと文。診断表のバッジと同じ enum をバインドする。
 * ニーズ軸（`ample` 等）とは別物なので、名前に軸を入れて取り違えを防ぐ。
 */
const DEATH_VERDICT_LABEL: Record<string, string> = {
  reducible: "減らせる可能性",
  uncertain: "圏内・要精査",
  shortage: "不足の可能性",
  pending: "判定は保留",
};

const SHORTFALL_TONE: Record<string, "ok" | "check" | "short" | "none"> = {
  reducible: "ok",
  uncertain: "check",
  shortage: "short",
  pending: "none",
};

/**
 * 過不足軸の判定カードの本文。
 *
 * **幅ゼロの世帯で「幅の右端」と言わない。**
 * `ample` / `not_needed` では `low = high` なので、文が指す幅が画面に存在しない。
 * 数直線は正しく「帯ではなく目盛り」で描いているのに、文だけが幅の存在を前提にしていた
 * （2026-09-21 の要素照合で発見）。T-B でレンジが復活すれば常に幅の文で真になるが、
 * **それまでの間も嘘をつかない**。
 */
function shortfallBody(v: string, hasRange: boolean): string {
  switch (v) {
    case "reducible":
      return `${hasRange ? "厳しめの前提（幅の右端）で計算しても" : "この必要額で計算しても"}、いまの保障が上回っています。減らせる可能性があります。ただし概算です。減額の手続きの前に、推定で補った項目を実際の値で答え直してください。`;
    case "uncertain":
      return "必要額の幅が、いまの保障を跨いでいます。この位置関係のとき、診断は「減らせる」とも「足りない」とも言い切りません。推定で補った項目を実際の値で答えると幅が狭まり、判定が確定に近づきます。";
    case "shortage":
      return `${hasRange ? "緩めに見た幅の左端にも" : "この必要額にも"}、いまの保障が届いていません。前提を見直すか、不足分の備え方を検討する段階です。`;
    default:
      return "いまの保障が分からないため、過不足は出していません。証券が見つかったら再診断できます。";
  }
}

const VERDICT: Record<string, { label: string; tone: "good" | "warn" | "muted" }> = {
  shortage: { label: "いまの前提では、備えが足りない可能性があります", tone: "warn" },
  sufficient: { label: "いまの前提では、おおむね足りています", tone: "good" },
  ample: { label: "いまの前提では、十分に足りています（上乗せも不要）", tone: "good" },
  not_needed: { label: "扶養するご家族がいないため、大きな死亡保障は不要です", tone: "muted" },
};

function money(yen: number): string {
  return formatMan(yen);
}

/** 就業形態の呼び名。**回答をそのまま読み返す**ので、算定側の語ではなく設問の語に揃える */
const EMPLOYMENT = {
  employee: "会社員",
  self: "自営・フリーランス",
  none: "無職",
} as const;

const EDU_PLAN_LABEL: Record<EducationPlan, string> = {
  public: "公立中心",
  mixed: "私立混在",
  private: "私立中心",
};

/**
 * STEP1 の回答チップ（照合表 #5）。**10問の回答を、そのまま並べ直すだけ。**
 *
 * ここに出る金額は**入力値**であって算定結果ではない（万円に丸めるだけで、式を通さない）。
 * エンジンの導出値を1つでも混ぜると「答えたこと」と「計算されたこと」の境目が消え、
 * 読み手は自分の回答を検算できなくなる。
 *
 * 旧「この診断が前提にした、いまの家計」（`household` の4項目）の役割をここが引き取る。
 * あちらは4項目に畳んでいたが、**畳むと畳んだ側の判断が入る**（世帯年収は本人＋配偶者の合算だった）。
 * チップは合算せず、答えた単位のまま出す。
 */
function answerChips(input: DiagnoseInput, coverage: number | null): AnswerChip[] {
  const man = (yen: number) => `約${Math.round(yen / 10000).toLocaleString("ja-JP")}万円`;
  /**
   * `field` はウィザードの項目名。**推定の記録（`normalize`）と同じ綴り**にする。
   *
   * キーからは**繰り返し語を削る**（「ご本人の年収」→「本人・年収」）。
   * 札が短くなるぶん1行に2枚以上流れ、10枚が縦一列に伸びない。
   */
  return [
    // ── ご家族と仕事 ──
    {
      field: null,
      group: "family",
      key: "本人",
      value: `${input.self.age}歳・${EMPLOYMENT[input.self.employment]}`,
    },
    {
      field: null,
      group: "family",
      key: "配偶者",
      value: input.spouse
        ? `${input.spouse.age}歳・${EMPLOYMENT[input.spouse.employment]}`
        : "なし",
    },
    {
      field: null,
      group: "family",
      key: "お子さん",
      value:
        input.children.length > 0
          ? `${input.children.length}人（${input.children.map((a) => `${a}歳`).join("・")}）`
          : "なし",
    },
    {
      field: "educationPlan",
      group: "family",
      key: "進路",
      value: EDU_PLAN_LABEL[input.educationPlan],
    },

    // ── 家計と資産 ──
    { field: "selfIncome", group: "money", key: "本人・年収", value: man(input.self.income) },
    ...(input.spouse
      ? [
          {
            field: "spouseIncome",
            group: "money" as const,
            key: "配偶者・年収",
            value: man(input.spouse.income),
          },
        ]
      : []),
    {
      field: "monthlyLiving",
      group: "money",
      key: "毎月の生活費",
      value: man(input.monthlyLiving),
    },
    { field: "assets", group: "money", key: "金融資産", value: man(input.assets) },

    // ── 住まいと保障 ──
    {
      field: "loan",
      group: "home",
      key: "住まい",
      // **1枚だけ長い。** 1行を専有させる（組版は他の札と同じ）
      wide: true,
      value:
        input.housing.type === "rent"
          ? "賃貸（住居費は生活費に含む）"
          : (input.housing.loan ?? 0) > 0
            ? `持ち家・ローン残り${man(input.housing.loan ?? 0)}`
            : "持ち家（ローンなし）",
    },
    // 団信は住まいと別の札にする（住まいの札に押し込むと、そこだけ2行になる）
    ...(input.housing.type === "own" && (input.housing.loan ?? 0) > 0
      ? [
          {
            field: null,
            group: "home" as const,
            key: "団信",
            value:
              input.housing.danshin === false
                ? "なし"
                : input.housing.danshin === undefined
                  ? "分からない"
                  : "あり",
          },
        ]
      : []),
    {
      field: null,
      group: "home",
      key: "いまの保障",
      value: coverage === null ? "未入力" : man(coverage),
    },
  ];
}

function CaseCard({
  title,
  r,
  pj,
  coverage,
  survivorLabel,
  childCount,
  danshinCovered,
  koseiFrom,
  workFrom,
  reform2028Reason,
  loan,
  livingBand,
  chips,
  estimations,
  terms,
  editHref,
}: {
  title: string;
  r: DeathResult;
  pj: Projection;
  /** いまの死亡保障額。分からない（未入力）なら null */
  coverage: number | null;
  /** 遺される側の呼び名（本人死亡なら「配偶者」、配偶者死亡なら「あなた」） */
  survivorLabel: string;
  /** 子の人数。家計台帳の出どころキャプションに使う（`children` は React の予約名なので避ける） */
  childCount: number;
  danshinCovered: boolean;
  koseiFrom: string | null;
  workFrom: string | null;
  reform2028Reason: string;
  /** 住宅ローン残高（判断ポイントの文面に使う） */
  loan: number | null;
  /** 生活費の幅（円/月・率と目盛りを掛けたあと）。帯が無い区分では null */
  livingBand: { low: number; high: number } | null;
  /** STEP1 の回答チップ（`answerChips` が作る）。**このケースの保障額を含む** */
  chips: AnswerChip[];
  /** STEP1 の推定ボックス（ウィザードの未回答の記録）。ケースによらず同じ */
  estimations: Estimation[];
  /** チップに出た専門用語の1行注釈 */
  terms: string[];
  /** 入力に戻るリンク */
  editHref: string;
}) {
  /**
   * STEP4 の判定カード。**過不足軸**（`Verdict3`）を使う ── バッジと同じ軸。
   * ニーズ軸（`r.verdict`）は滝の最終行のラベルが使っており、別物（CLAUDE.md「判定には軸名を添える」）。
   */
  const v3 = verdict3(coverage, r.range.low, r.range.high);
  const shortfallVerdict = {
    label: DEATH_VERDICT_LABEL[v3],
    tone: SHORTFALL_TONE[v3],
    body: shortfallBody(v3, r.range.low !== r.range.high),
  };
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

      {/*
        STEP1（照合表 #5）。**移植元は result.html の STEP 1。**
        ここで旧 h2「この診断が前提にした、いまの家計」（`Vitals` の4項目）と
        旧 h3「推定で補った前提」を**まとめて置き換えた**（CLAUDE.md「置換であって共存ではない」）。

        **ケースの中に置く。** 推定で補った項目はケースごとに違う
        （本人死亡と配偶者死亡では、遺される側が入れ替わるので前提も入れ替わる）ため、
        ページ直下に1つ置くと、どちらのケースの前提なのか言えなくなる。
      */}
      <Step1 chips={chips} editHref={editHref} estimations={estimations} terms={terms} />

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

      {/*
        STEP2（照合表 #6a〜#6e）。**移植元は result.html の左カラム＋段差チャート。**
        ここで旧 `Cashflow` の2図（1年ごとの収入と支出／万一のあとの残高）を撤去した。
        見た目は違うが「いつ・いくら」という**同じ情報**を出しており、2つ残すと
        どちらが正かを読み手に判断させることになる（CLAUDE.md「置換であって共存ではない」）。
      */}
      <Step2
        danshinCovered={danshinCovered}
        from={{
          pension: childCount > 0 ? `子${childCount}人` : null,
          kosei: koseiFrom,
          work: workFrom,
          housing: danshinCovered ? "団信あり" : null,
          living: "毎月の生活費",
          education: "お子さんの進路",
        }}
        livingBand={livingBand}
        pj={pj}
        reform2028Reason={reform2028Reason}
        survivorLabel={survivorLabel}
      />

      {/* 必要保障額の推移。点（今日いくら）ではなく線（いつまでいくら）で見せる */}
      <CoverageCurve coverage={coverage} points={coverageCurve(pj, r.income.assets)} />

      {/*
        STEP3 滝グラフ（照合表 #7）。**移植元は result.html の #wfRows。**
        ここで旧 `GapWaterfall` を撤去した ── 同じ引き算を別の形で出していた。

        **モックの滝は不足世帯のサンプルで描かれている。** 余剰が出る世帯では
        棒がマイナスに突き抜けるので、控除は0で止め、超過分は「余る分」の行に回す。
      */}
      <Waterfall
        deductions={[
          {
            label: "遺族年金でカバー",
            from: `${r.income.pensionKosei > 0 ? "会社員（厚生年金）" : "自営・フリーランス"}${childCount > 0 ? `・子${childCount}人` : ""}`,
            source: "日本年金機構",
            amount: r.income.pensionBasic + r.income.pensionKosei + r.income.chukoreiKafu,
          },
          {
            label: `${survivorLabel}の就労収入`,
            from: "配偶者の年収",
            note: "手取りに換算し、算定期間ぶん積んだもの",
            source: null,
            amount: r.income.survivorWork,
          },
          {
            label: "貯蓄・資産",
            from: "世帯の金融資産",
            source: null,
            amount: r.income.assets,
          },
        ].filter((d) => d.amount > 0)}
        fmt={(yen) => `約${money(yen)}`}
        footnote={
          danshinCovered
            ? "住居費 0円 ─「団信あり」の回答から、万一のとき住宅ローンは保険で完済されるため、住居費を総額に含めていません。"
            : null
        }
        result={{
          low: r.range.low,
          high: r.range.high,
          // モックの言い方（「＝ 民間保険で備える額」）に揃え、中身の性質を括弧で添える
          label: `民間保険で備える額${RESULT_QUALIFIER[r.verdict] ?? ""}`,
          note: RESULT_NOTE[r.verdict] ?? RESULT_NOTE.sufficient,
        }}
        surplusNote={`この余りは、${survivorLabel}の就労収入（約${money(r.income.survivorWork)}）の前提の上にあります。`}
        total={r.expense.total}
        totalFrom="STEP 2 の毎月の収支を通算し、大学の山と一度きりの支出まで足したもの"
        totalLabel="遺されたご家族に必要な総額"
      />

      {/*
        STEP4（照合表 #8a〜#8c）。数直線＋判定カード＋判断ポイント。
        旧 `verdictLine`（1行の判定）を撤去し、**位置関係で判定を示す形**に置換した。
        判断ポイントは `decisionPoints`（src/calc）が世帯ごとに導出する ── 手書きの固定文ではない。
      */}
      <NumberLine
        coverage={coverage}
        fmt={(yen) => `約${money(yen)}`}
        need={{ low: r.range.low, high: r.range.high }}
        points={decisionPoints(r, pj, { loan, danshinCovered })}
        verdict={shortfallVerdict}
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
  /**
   * 暮らし方の目盛り（#4・D-02・ADR-022）。**URL が状態そのもの**なので、
   * 押すたびにサーバで全部計算し直す ── 部分更新の取り残しが原理的に起きない。
   * 既定（いま通り）は URL に書かない。
   */
  const livingLevel = decodeLivingLevel(q);
  const dial = dialFor(params, livingLevel);
  const { input: rawInput, estimations } = normalize(params, complete, new Date());
  const input = { ...rawInput, lifestyleDial: dial };
  const result = diagnose(params, input);

  /**
   * **目盛りを動かしても必要額が変わらない世帯がある。**
   * `ample` / `not_needed` は必要額が葬儀・予備費の床に張り付くので、
   * 生活費が動いても必要額は動かない。**無反応ではなく「吸収されている」**ので、そう言う
   * （感度文と同じ分岐の作り・2026-09-21 オーナー指示）。
   */
  /**
   * 生活費の幅（D-01）。**出どころは回答帯**で、目盛り（D-02）ではない。
   * 帯 × 率（子育て期の 0.70） × 目盛り。
   * 上端の無い区分（`35万円以上`）と「年収から推定」では幅を作らない ── 無い幅を発明しない。
   */
  const band =
    complete.livingCost !== "estimate"
      ? params.inputRanges.monthlyLivingBand[complete.livingCost]
      : undefined;
  const livingBand =
    band?.high !== undefined
      ? {
          low: band.low * v(params, "survivorLivingRatioChild") * dial,
          high: band.high * v(params, "survivorLivingRatioChild") * dial,
        }
      : null;

  const needsAcrossDials = LIVING_LEVELS.map((lv) => {
    const r = diagnose(params, { ...rawInput, lifestyleDial: dialFor(params, lv) });
    return `${r.self.range.low}-${r.self.range.high}`;
  });
  const absorbedNote =
    new Set(needsAcrossDials).size === 1 &&
    (result.self.verdict === "ample" || result.self.verdict === "not_needed")
      ? "前提を変えても、公的な年金と資産の範囲に収まっています。必要額は葬儀・予備費のぶんのままです。"
      : null;

  // 年次キャッシュフロー（US-04b）。総額と同じ係数・同じ前提で、合計する前の姿を出す。
  // 変動率は既定の0（実値への切り替えはパラメータ版の更新でやる。SPEC 参照）。
  const asOfYear = jstYear(new Date());
  /**
   * **`Household` を手で組まない。** `toHousehold` を通す（src/calc）。
   * 2026-09-21、ここで `lifestyleDial` を1つ落としており、必要額だけ動いて
   * 年次（台帳・段差チャート）が古いまま残った。入力に項目が増えても落ちない形にする。
   */
  const selfProjection = projectDeath(params, toHousehold(input, "self"), { asOfYear });
  const spouseProjection = input.spouse
    ? projectDeath(params, toHousehold(input, "spouse"), { asOfYear })
    : null;

  /**
   * 冒頭ヒーローに流す世帯4値（仕様 §5.3）。
   *
   * **`householdHeadline` ではなく `householdSummary` を使う。** 前者の差額は `gap` 由来で、
   * 過剰の閾値が `coverage > high * 1.5` と判定3値の不等号から外れている。
   * 判定と差額の出どころを揃えないと、見出しが自分の根拠と食い違う。
   */
  // 団信ありなら住宅ローンは死亡時に消える。家計台帳の「住宅ローン 0円」の行に使う
  const danshinCovered =
    input.housing.type === "own" &&
    (input.housing.loan ?? 0) > 0 &&
    input.housing.danshin !== false;

  const hh = householdSummary([
    {
      coverage: input.coverageSelf,
      needLow: result.self.range.low,
      needHigh: result.self.range.high,
    },
    ...(result.spouse
      ? [
          {
            coverage: input.coverageSpouse,
            needLow: result.spouse.range.low,
            needHigh: result.spouse.range.high,
          },
        ]
      : []),
  ]);

  // 減らせる箇所（無ければ「見つかりませんでした」と明示する＝沈黙で誤解させない）
  const totalExcess = result.householdHeadline.totalExcess;

  /**
   * リスク別健康診断表の6行（仕様 §5.3）。
   *
   * **死亡は本人・配偶者を2行に分ける。** 個人の判定が正で、世帯の集約（組み替えの余地など）は
   * 軸が違うのでここには混ぜない（世帯の結論は下の死亡詳細セクションに出る）。
   * **所見の文言はモック `docs/design-mock/check.html` が正で、金額だけ実計算値に差し替える。**
   */
  // **同じ日付で回す。** 感度文と診断表で asOf がずれると、年齢が1歳違う結果を並べてしまう
  const asOfDate = new Date();
  const sims = simulateAll(params, {
    answers: input,
    asOf: asOfDate,
    assumptions: { livingLevel },
  });
  const bySc = Object.fromEntries(sims.map((x) => [x.scenario, x]));
  const TONE = { reducible: "ok", uncertain: "check", shortage: "short" } as const;
  const DEATH_LABEL = {
    reducible: "減らせる可能性",
    uncertain: "圏内・要精査",
    shortage: "不足の可能性",
    pending: "判定できません",
  } as const;
  const SAVINGS_LABEL = {
    reducible: "大丈夫のめやす",
    uncertain: "圏内・要精査",
    shortage: "備え不足の可能性",
    pending: "判定できません",
  } as const;

  /**
   * 感度文（仕様 §5.3 T-E・2026-09-21 オーナー承認の文型）。
   *
   * **露出部は帯の直下にこの1文だけ。** 分岐と数値は `survivorIncomeSensitivity`（src/calc）が出す。
   * ここがやるのは、返ってきた値を文に差し込むことだけ。
   *
   * 文型ルール：
   * - 判定ラベルは**バッジと同じ `DEATH_LABEL`** をバインドする。手打ちで再入力しない
   * - **括弧の中は手取りで書く。** 額面と手取りを混ぜると掛け算が合わなくなる
   *   （`年700万円×25年＝約1億4,000万円` は合わない。手取り560万×25年なら合う）
   * - 否定で終わらせない。**判定が動かない場合でも、必要額がどれだけ動くかを書く**
   */
  const sensitivityFor = (who: "self" | "spouse"): { text: string } | null => {
    const sv = survivorIncomeSensitivity(params, input, who, asOfDate);
    if (!sv) return null;

    const label = who === "self" ? "遺されたご家族" : "あなた";
    const total = `約${money(sv.workTotal)}`;
    const bare = (yen: number) => money(yen).replace("万円", "");
    /**
     * **括弧の掛け算が読者の手元で合うようにする。**
     * 末子独立後に下限（年100万円）が効く世帯は単純な掛け算にならないので、2本立てで書く。
     */
    const breakdown =
      sv.annualNet === sv.netAfter
        ? `手取り 年${bare(sv.annualNet)}万円×${sv.yearsTotal}年`
        : `手取り 年${bare(sv.annualNet)}万円×${sv.yearsDependent}年＋年${bare(sv.netAfter)}万円×${sv.yearsAlone}年`;
    const lead = `この判定を支えているのは、${label}の就労収入 ${total}（${breakdown}）です。`;
    /**
     * **半額の軸を裸にしない。** 直前の括弧が「手取り 年560万円」なので、
     * ここで「年350万円」とだけ書くと、額面の半分なのか手取りなのかを読者が決められない
     * （手取りの半分だと思って検算すると 280万 になり、文が崩れる）。
     * 動かしているのは**回答された年収（額面）**なので、そう書く。
     * `half` は常に額面側・「年収」の語を添える
     * （折りたたみ1項目目の「年収＝答えた値、手取り＝計算に使う値」という役割分担と揃える）。
     */
    const halfGross = `年収が半分（${bare(sv.annualGross / 2)}万円）`;

    /**
     * **判定が動かなくても「影響が無い」ではない。**
     * この世帯では必要額が 約200万円 → 約800〜1,200万円 と4〜6倍に動くのに、
     * 承認された文型だと「変わりません」だけで数字が消える。
     * 数字の検算が通らない開示は無いより悪いので、必要額の移動を必ず添える（2026-09-21）。
     */
    if (sv.branch === "no_verdict_change") {
      return {
        text: `${lead}収入がなくなると必要額は${formatRange(sv.needNow.low, sv.needNow.high)}から${formatRange(sv.needAtZero.low, sv.needAtZero.high)}に増えますが、いまの保障が上回るため判定は変わりません。`,
      };
    }
    if (sv.branch === "zero_only") {
      return {
        text: `${lead}${halfGross}になっても判定は変わりませんが、働けない場合は「${DEATH_LABEL[sv.verdictAtZero]}」に変わります。`,
      };
    }
    return {
      text: `${lead}${halfGross}になると「${DEATH_LABEL[sv.verdictAtHalf]}」、働けない場合は「${DEATH_LABEL[sv.verdictAtZero]}」に変わります。`,
    };
  };

  /** 死亡の1行を作る。本人と配偶者で同じ形にする */
  const deathRow = (
    who: "本人" | "配偶者",
    dr: typeof result.self,
    cov: number | null | undefined,
  ): RiskRow => {
    const v = verdict3(cov, dr.range.low, dr.range.high);
    const range = formatRange(dr.range.low, dr.range.high);
    const hold = cov ?? null;
    const covText = hold === null ? "未入力" : `約${money(hold)}`;
    /**
     * **必要額が葬儀費用だけになる世帯は、その理由を先に言う。**
     * `ample`（公的年金と資産で生活費がまかなえる）と `not_needed`（扶養家族がいない）は
     * `death.ts` で low = high = 葬儀費用になる。理由抜きで「必要額 約200万円」とだけ出すと、
     * 読み手には桁を間違えた数字に見える。良い知らせは良い知らせとして届ける（CLAUDE.md）。
     */
    const funeralOnly = dr.verdict === "ample" || dr.verdict === "not_needed";
    const reason =
      dr.verdict === "ample"
        ? "公的な年金と資産で、遺されたご家族の生活費はまかなえる見込みです。"
        : dr.verdict === "not_needed"
          ? "扶養しているご家族がいないため、上乗せの保障は要りません。"
          : "";
    /**
     * **所見は2文以内で、金額を書かない。**
     * 金額は figures の明朝20px、過不足は数直線の位置関係が伝える（視覚の DoD (b)）。
     * ここに数字を戻すと、また「読まないと分からない画面」に戻る。
     */
    const body =
      v === "pending"
        ? "いまの保障が分からないため、過不足は出していません。"
        : v === "reducible"
          ? funeralOnly
            ? "見込むのは葬儀費用だけで、いまの保障はそれを上回っています。"
            : "厳しめに見た必要額の上端よりも、いまの保障が上回っています。"
          : v === "uncertain"
            ? "必要額の幅がいまの保障を跨いでいるため、減らせるとも足りないとも言い切りません。"
            : "ゆるめに見た必要額の下端にも、いまの保障が届いていません。";
    return {
      key: `death-${who}`,
      title: `死亡（${who}）`,
      subtitle: "遺されたご家族の生活",
      tone: v === "pending" ? "none" : TONE[v],
      verdictLabel: DEATH_LABEL[v],
      precisionLabel: "計算済み",
      precisionTone: "calculated",
      figures: {
        needLabel: "必要額",
        needText: range,
        holdLabel: "いまの保障",
        holdText: covText,
      },
      scale: {
        needLow: dr.range.low,
        needHigh: dr.range.high,
        hold,
        axisMaxText: `約${money(Math.max(dr.range.high, hold ?? 0))}`,
      },
      note: `${reason}${body}`,
      // 判定を支えている前提（仕様 §5.3 の開示6点）。`ample` 系のときだけ engine が返す
      assumptions: dr.assumptions.map((a) => ({ label: a.label ?? "前提", note: a.note })),
      // 前提の重みを図にする。金額は算定結果（income）から取り、UI では作らない
      premiseWeight:
        dr.assumptions.length > 0 && dr.income.total > 0 && dr.income.survivorWork > 0
          ? {
              share: dr.income.survivorWork / dr.income.total,
              totalText: `約${money(dr.income.total)}`,
              onPremiseText: `約${money(dr.income.survivorWork)}`,
              survivorLabel: who === "本人" ? "遺されたご家族" : "あなた",
            }
          : null,
      premiseSensitivity:
        dr.assumptions.length > 0 ? sensitivityFor(who === "本人" ? "self" : "spouse") : null,
      link: { href: "#death-detail", label: "詳しく →" },
    };
  };

  /** 制度式で概算する行（病気・けが・失業）。受け皿は保険ではなく貯蓄 */
  const savingsRow = (
    key: string,
    title: string,
    subtitle: string,
    sim: (typeof sims)[number],
    lead: string,
  ): RiskRow => {
    const v = sim.verdict ?? "pending";
    const range = sim.amounts ? formatRange(sim.amounts.needLow, sim.amounts.needHigh) : "—";
    // 受け皿は貯蓄。`simulate` に幅を渡していないので、いまは1点（`assumptions[]` にそう書いてある）
    const hold = input.assets;
    const tail =
      v === "reducible"
        ? "いまの貯蓄で受けられる水準です。"
        : v === "shortage"
          ? "いまの貯蓄では届かない可能性があります。"
          : "いまの貯蓄と幅が重なるので、言い切れません。";
    return {
      key,
      title,
      subtitle,
      tone: v === "pending" ? "none" : TONE[v],
      verdictLabel: SAVINGS_LABEL[v],
      precisionLabel: "制度式で概算",
      precisionTone: "statutory",
      figures: {
        needLabel: "必要額",
        needText: range,
        holdLabel: "いまの貯蓄",
        holdText: `約${money(hold)}`,
      },
      scale: sim.amounts
        ? {
            needLow: sim.amounts.needLow,
            needHigh: sim.amounts.needHigh,
            hold,
            axisMaxText: `約${money(Math.max(sim.amounts.needHigh, hold))}`,
          }
        : null,
      // 所見は2文以内。金額は figures と数直線が持つ（視覚の DoD (b)）
      note: `${lead}${tail}`,
      // 完全な記録として全項目を折りたたみに出す（判定を左右する項目には見出し語が付いている）
      assumptions: sim.premises,
      // 帯と感度文は死亡カード専用。ここは受け皿が貯蓄で、動かす前提が1本に決まらない
      premiseWeight: null,
      premiseSensitivity: null,
      // ラボは未実装。**押せないことを黙らせない**
      link: { pending: "もしもラボで見る（準備中）" },
    };
  };

  const riskRows: RiskRow[] = [
    deathRow("本人", result.self, input.coverageSelf),
    ...(result.spouse ? [deathRow("配偶者", result.spouse, input.coverageSpouse)] : []),
    savingsRow(
      "sick_short",
      "病気・けが（短期）",
      "入院・〜3か月の休み",
      bySc.sick_short,
      "高額療養費と傷病手当金が効く範囲です。",
    ),
    savingsRow(
      "sick_long",
      "病気・けが（長期休職）",
      "がん・脳卒中・こころ／〜1年半",
      bySc.sick_long,
      "傷病手当金は通算1年6か月で切れます。",
    ),
    {
      key: "disability",
      title: "就業不能・障害",
      subtitle: "1年半を超えて働けない",
      tone: "none",
      verdictLabel: "未診断",
      precisionLabel: "計算未対応",
      precisionTone: "unsupported",
      figures: null,
      scale: null,
      note: bySc.disability.notSupported?.detail ?? "",
      assumptions: [],
      premiseWeight: null,
      premiseSensitivity: null,
      link: { pending: "もしもラボで見る（準備中）" },
    },
    savingsRow(
      "unemployment",
      "失業",
      "仕事を失ったとき",
      bySc.unemployment,
      "雇用保険の基本手当と生活防衛資金で受ける領域で、保険で備える場所ではありません。",
    ),
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

  /**
   * チップに出た専門用語の1行注釈（CLAUDE.md「専門用語は初出で1行注釈」）。
   * **旧「いまの家計」の住まいの欄が負っていた責務**をここへ移した。
   * これを落とすと、以降の「回答: 団信あり」や滝の脚注が無注釈の初出になる。
   */
  const terms =
    input.housing.type === "own" && (input.housing.loan ?? 0) > 0
      ? ["団信＝亡くなると住宅ローンが消える保険です。"]
      : [];
  const editHref = `/wizard?${q.toString()}`;

  const caption = `${input.self.age}歳・${input.self.employment === "employee" ? "会社員" : input.self.employment === "self" ? "自営・フリーランス" : "無職"}${input.spouse ? `・配偶者${input.spouse.age}歳` : "・配偶者なし"}${input.children.length > 0 ? `・子${input.children.length}人` : "・子なし"}`;

  /**
   * 必要額が葬儀費用だけになる世帯に添える1行（仕様 §5.3）。
   * 本人と配偶者のどちらもその状態のときだけ出す。片方だけなら世帯の話にならない。
   */
  /**
   * `組み替えの余地` に添える金額の1行（仕様 §5.3・2026-09-21）。
   *
   * **旧「検査値パネル」（`Vitals`）の「世帯の過不足」タイルの移し先。**
   * あちらは「減らせる額（世帯）約1,800万円 ／ 一方で約200万円足りません」と
   * 両方の金額を出していたが、ヒーローの見出しは**金額を1つも出さない**。
   * 撤去にあたって、その2つをここで復元する。
   *
   * **不足している側は過不足軸（`Verdict3`）で名指す。** ニーズ軸ではない
   * （CLAUDE.md「判定には必ず軸名を添える」）。
   */
  const rebalanceNote = (() => {
    if (hh.verdict !== "rebalanceable") return null;
    const shortSides = [
      verdict3(input.coverageSelf, result.self.range.low, result.self.range.high) === "shortage"
        ? "あなたの保障"
        : null,
      result.spouse &&
      verdict3(
        input.coverageSpouse ?? null,
        result.spouse.range.low,
        result.spouse.range.high,
      ) === "shortage"
        ? "配偶者の保障"
        : null,
    ].filter((x): x is string => x !== null);
    // 名指す相手が取れないときは、どこに足りないのかを言えないので出さない
    if (shortSides.length === 0) return null;
    const where = shortSides.join("と");
    return `約${money(hh.totalReducible)}は減らせる一方、${where}に約${money(hh.totalShortage)}足りません。`;
  })();

  /**
   * 使った前提と出典（照合表 #9）。**ラベルとURLは `params` から取る。**
   * 画面で出典名を手打ちすると、制度側が変わったときに値だけ更新されて表示が古く残る。
   *
   * **モックの4チップを書き写さない。** モックは「生活費水準: 総務省 家計調査」を挙げるが、
   * この実装の生活費は**利用者の回答**（幅）に当社基準の率を掛けたもので、家計調査は使っていない。
   */
  const usedSources: UsedSource[] = [
    {
      what: "遺族年金の額",
      label: params.public.izokuKisoBase.source ?? "日本年金機構",
      url: "https://www.nenkin.go.jp/service/jukyu/seido/izokunenkin/jukyu-yoken/index.html",
      verified: params.public.izokuKisoBase.verified !== false,
    },
    {
      what: "高額療養費",
      label: params.kogaku.sources.brackets.label,
      url: params.kogaku.sources.brackets.url,
      verified: params.kogaku.sources.brackets.verified,
    },
    {
      what: "傷病手当金",
      label: params.shobyoTeate.sources.rate.label,
      url: params.shobyoTeate.sources.rate.url,
      verified: params.shobyoTeate.sources.rate.verified,
    },
    {
      what: "雇用保険 基本手当",
      label: params.kihonTeate.sources.daysGeneral.label,
      url: params.kihonTeate.sources.daysGeneral.url,
      verified: params.kihonTeate.sources.daysGeneral.verified,
    },
    {
      what: "教育費",
      label: "文部科学省「子供の学習費調査」",
      url: "https://www.mext.go.jp/b_menu/toukei/chousa03/gakushuuhi/1268091.htm",
      verified: false,
    },
    {
      what: "高校生等への就学支援",
      label: "文部科学省「高校生等への修学支援」",
      url: "https://www.mext.go.jp/a_menu/shotou/mushouka/index.htm",
      verified: params.education.shien.verified !== false,
    },
  ];
  const sourcesNote = `制度パラメータ版 ${result.paramVersion} に、各値の出典URLと施行日を記録しています。下の当社基準には公的出典がありません。`;

  const deathResults = [result.self, ...(result.spouse ? [result.spouse] : [])];
  const funeralOnlyNote = deathResults.every((r) => r.verdict === "ample")
    ? "公的な年金と資産で、遺されたご家族の生活費はまかなえる見込みです。上乗せで要るのは葬儀費用だけです。この判定は、遺されたご家族が働き続ける前提に立っています（前提は下の各行に出しています）。"
    : deathResults.every((r) => r.verdict === "not_needed")
      ? "扶養しているご家族がいないため、上乗せの保障は要りません。見込むのは葬儀費用だけです。"
      : null;

  return (
    <main className={s.page}>
      {/* 1. 冒頭ヒーロー（移植元 result.html 冒頭）。判定は §1 の世帯4値 */}
      <Hero
        verdict={hh.verdict}
        caption={caption}
        diffText={
          hh.verdict === "shortage"
            ? `約${money(hh.totalShortage)}`
            : hh.totalReducible > 0
              ? `約${money(hh.totalReducible)}`
              : null
        }
        funeralOnlyNote={funeralOnlyNote}
        rebalanceNote={rebalanceNote}
        coverageText={hh.totalCoverage === null ? "未入力" : `約${money(hh.totalCoverage)}`}
        needText={formatRange(hh.totalNeed.low, hh.totalNeed.high)}
        needHasRange={hh.totalNeed.low !== hh.totalNeed.high}
        modeText="いま通り"
      />

      {/* 照合表 #4：暮らし方の前提トグル。**ヒーロー直下**（仕様 §5.3 のページ順） */}
      <LivingDial
        absorbedNote={absorbedNote}
        current={livingLevel}
        hrefFor={(lv) => `/result?${withLivingLevel(q, lv)}`}
      />

      {/* 3. 玄関：リスク別健康診断表（仕様 §5.3）。この下に死亡の詳細が縦1本で続く */}
      <RiskTable caption={caption} rows={riskRows} />

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

      {/*
        2028年の年金改正の該当/非該当（事実として中立に明示）。

        **開示の型を当てて畳む**（2026-09-21・視覚の DoD (a)）。
        実測でこの注記だけで 746px あり、前後の散文と合わせて
        **図も大きな数字も無い区間を2画面ぶん**作っていた。
        露出は該当/非該当の1行（決定的な部分）、全文は文字数を明示した1タップの奥。
        **開示を減らしたのではなく、決定的な1点を前に出して残りを畳んだ**（CLAUDE.md）。
      */}
      <div className={s.section}>
        <div className={s.reformNote}>
          <strong>2028年の年金改正について：</strong>{" "}
          {result.reform2028.applicable ? "この改正の対象になります。" : "この改正の対象外です。"}
          <details className={s.reformDetails}>
            <summary>この判断の根拠を読む（{result.reform2028.reason.length} 字）</summary>
            <p className={s.reformBody}>{result.reform2028.reason}</p>
          </details>
        </div>
      </div>

      {/* 因数分解（本人・配偶者）
          **全幅にはしない。** 一度広げてみたが、SVG は viewBox で伸縮するので
          図を広げると軸の文字まで拡大されて崩れる。30本の棒も6列の表も720pxで足りており、
          実際に幅を必要としていたのは検査値パネル（4列）だけだった。 */}
      <div className={`${s.section} ${s.sectionMajor}`} id="death-detail">
        <CaseCard
          childCount={input.children.length}
          chips={answerChips(input, input.coverageSelf)}
          coverage={input.coverageSelf}
          danshinCovered={danshinCovered}
          editHref={editHref}
          estimations={estimations}
          terms={terms}
          koseiFrom={input.self.employment === "employee" ? "会社員" : null}
          pj={selfProjection}
          r={result.self}
          livingBand={livingBand}
          loan={input.housing.loan ?? null}
          reform2028Reason={result.reform2028.reason}
          survivorLabel="配偶者"
          title="あなたが亡くなった場合"
          workFrom={input.spouse && input.spouse.income > 0 ? "配偶者の年収" : null}
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
              childCount={input.children.length}
              chips={answerChips(input, input.coverageSpouse ?? null)}
              coverage={input.coverageSpouse ?? null}
              danshinCovered={danshinCovered}
              editHref={editHref}
              estimations={estimations}
              terms={terms}
              koseiFrom={input.spouse?.employment === "employee" ? "配偶者は会社員" : null}
              pj={spouseProjection}
              r={result.spouse}
              /* **配偶者が亡くなるケースでは遺族は本人。** `result.reform2028` は
                 遺族＝配偶者のケースで作られているので、そのまま出すと別人の年齢で判定した
                 注記を出すことになる（2026-09-21 の検品で発見） */
              reform2028Reason={
                reform2028({
                  survivorAge: input.self.age,
                  asOfYear,
                  hasChildren: input.children.length > 0,
                }).reason
              }
              livingBand={livingBand}
              loan={input.housing.loan ?? null}
              survivorLabel="あなた"
              title="配偶者が亡くなった場合"
              workFrom={input.self.income > 0 ? "あなたの年収" : null}
            />
          </details>
        )}
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

      {/*
        照合表 #9「使った前提と出典」。**移植元は result.html の同名ブロック。**
        ここで旧「参考（公的機関）」のリンク箇条書きと、その下の散文1段落を**置換**した
        ── 同じ出典がリスト・散文・滝のキャプションの3か所に散っていた。
      */}
      <div className={s.section}>
        <UsedSources items={usedSources} note={sourcesNote} />
      </div>

      {/*
        当社基準（照合表 #9 の後半）。
        **当社基準は手書きで並べない。** `params` の `ownStandard` を**在庫一覧としてそのまま出す**
        ── 散らばった当社基準が一覧されていないと、増えたときに画面だけ古くなる。
        2026-09-21、葬儀・予備費の「床として使う置き方」をここに昇格させた
        （時期の根拠がどの文書にも無いと全文確認で分かったため）。
      */}
      <h3 className={s.h3}>当社基準（公的出典のない当社の見立て）</h3>
      <ul className={s.list}>
        {Object.entries(params.ownStandard).map(([key, e]) => (
          <li key={key}>
            {e.label ?? key}
            {e.userAdjustable ? "（画面で動かせます）" : ""}
          </li>
        ))}
      </ul>

      <div className={s.draftNote}>
        次の一歩・選ぶ基準の文面は、保険業法の正式な弁護士レビュー（OI-01）後に確定します（現在はサンプル）。
        <br />
        <Link className={s.link} href={`/wizard?${q.toString()}`}>
          入力をやり直す
        </Link>
      </div>

      {/*
        照合表 #10：`check.html` 末尾の黒帯を**ページ最下部**へ（キックオフの積み残し）。
        診断表の直下ではなく最下部に置くのは、この2行が**全部読み終えた人への一文**だから。
        玄関（診断表）の直後に置くと、まだ根拠を見ていない人に結論だけ言う形になる。
      */}
      <aside className={s.statement}>
        <p className={s.statementHead}>万が一しか診ない計算機は、要らない。</p>
        <p className={s.statementBody}>
          人生のリスクを、正直な精度表示つきで、全部診る。それが「お金の主治医」の仕事です。
        </p>
      </aside>
    </main>
  );
}
