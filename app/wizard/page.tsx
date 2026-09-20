"use client";

/**
 * 入力ウィザード S1〜S5（保険以外・T-03）
 *
 * 状態は URL に持たせて中断・再開できる（FR-08 / US-03、DBなし）。実額は載せない（区分コードのみ）。
 * 正規化・算定はしない（それは結果ページ＝サーバ側の責務）。ここは「選ばせて URL に写す」だけ。
 * 判定色に頼らないよう、選択はチェック記号でも示す。フォーカスリングは tokens.css に任せる。
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { decodeSelections, encodeSelections } from "../../src/wizard/url.js";
import { isComplete } from "../../src/wizard/complete.js";
import { jstYear } from "../../src/time/jstYear.js";
import type {
  AssetCode,
  CoverageCode,
  DanshinChoice,
  EducationPlanChoice,
  EmploymentChoice,
  HousingChoice,
  IncomeCode,
  LivingCode,
  LoanCode,
  SpouseEmploymentChoice,
  SpouseIncomeCode,
  WizardSelections,
} from "../../src/wizard/types.js";
import s from "./page.module.css";

const EMPLOYMENT: [EmploymentChoice, string][] = [
  ["employee", "会社員"],
  ["civil_servant", "公務員"],
  ["self", "自営・フリーランス"],
];
const SPOUSE_EMPLOYMENT: [SpouseEmploymentChoice, string][] = [
  ...EMPLOYMENT,
  ["none", "専業主婦・主夫／無職"],
];
const INCOME: [IncomeCode, string][] = [
  ["lt400", "400万円以下"],
  ["lt600", "400〜600万円"],
  ["lt800", "600〜800万円"],
  ["lt1000", "800〜1000万円"],
  ["gte1000", "1000万円以上"],
  ["prefer_not", "答えたくない"],
];
const SPOUSE_INCOME: [SpouseIncomeCode, string][] = [["none", "収入なし"], ...INCOME];
const ASSETS: [AssetCode, string][] = [
  ["lt100", "100万円以下"],
  ["lt300", "100〜300万円"],
  ["lt500", "300〜500万円"],
  ["lt1000", "500〜1000万円"],
  ["gte1000", "1000万円以上"],
  ["unknown", "分からない"],
];
const LIVING: [LivingCode, string][] = [
  ["lt20", "20万円以下"],
  ["lt25", "20〜25万円"],
  ["lt30", "25〜30万円"],
  ["lt35", "30〜35万円"],
  ["gte35", "35万円以上"],
  ["estimate", "年収からおまかせで推定する"],
];
const HOUSING: [HousingChoice, string][] = [
  ["own_loan", "持ち家（住宅ローンあり）"],
  ["own_noloan", "持ち家（ローンなし）"],
  ["rent", "賃貸"],
];
const LOAN: [LoanCode, string][] = [
  ["lt500", "500万円以下"],
  ["lt1000", "500〜1000万円"],
  ["lt1500", "1000〜1500万円"],
  ["lt2000", "1500〜2000万円"],
  ["lt3000", "2000〜3000万円"],
  ["gte3000", "3000万円以上"],
  ["unknown", "分からない"],
];
const DANSHIN: [DanshinChoice, string][] = [
  ["yes", "入っている"],
  ["no", "入っていない"],
  ["unknown", "分からない"],
];
const COVERAGE: [CoverageCode, string][] = [
  ["none", "加入していない"],
  ["m300", "300万円"],
  ["m500", "500万円"],
  ["m1000", "1000万円"],
  ["m1500", "1500万円"],
  ["m2000", "2000万円"],
  ["m3000", "3000万円"],
  ["m5000", "5000万円"],
  ["gte10000", "1億円以上"],
  ["unknown", "分からない"],
];

const EDU_PLAN: [EducationPlanChoice, string][] = [
  ["public", "公立中心"],
  ["mixed", "私立混在（高校・大学は私立など）"],
  ["private", "私立中心"],
  ["undecided", "まだ決めていない"],
];

const STEP_TITLES = [
  "あなたのこと",
  "ご家族のこと",
  "収入のこと",
  "資産と暮らし",
  "住まいのこと",
  "保険のこと",
];
const TOTAL = STEP_TITLES.length;

function RadioGroup<T extends string>(props: {
  legend: string;
  note?: string;
  options: [T, string][];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  // 生のラジオ入力を使う（矢印キー移動などのキーボード操作がネイティブに効く）。
  // 選択は色だけでなくラジオのドットでも伝わる（色のみ依存を避ける）。
  return (
    <fieldset className={s.field}>
      <legend className={s.legend}>{props.legend}</legend>
      {props.note ? <p className={s.note}>{props.note}</p> : null}
      <div className={s.choices}>
        {props.options.map(([val, label]) => (
          <label key={val} className={s.choice}>
            <input
              type="radio"
              name={props.legend}
              value={val}
              checked={props.value === val}
              onChange={() => props.onChange(val)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function YearSelect(props: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const years: number[] = [];
  for (let y = props.max; y >= props.min; y--) years.push(y);
  return (
    <label className={s.select}>
      {props.label}：
      <select value={props.value ?? ""} onChange={(e) => props.onChange(Number(e.target.value))}>
        <option value="" disabled>
          選択
        </option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}年
          </option>
        ))}
      </select>
    </label>
  );
}

export default function WizardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState<Partial<WizardSelections>>({});

  // URL から復元（クライアントでのみ実行。SSR とのズレを避けるため mounted 後に描画）
  useEffect(() => {
    setSel(decodeSelections(window.location.search.replace(/^\?/, "")));
    setMounted(true);
  }, []);

  // 変更のたびに URL へ写す（履歴を汚さないよう replace）
  useEffect(() => {
    if (!mounted) return;
    const qs = encodeSelections(sel);
    window.history.replaceState(null, "", `${window.location.pathname}?${qs}`);
  }, [sel, mounted]);

  if (!mounted) return null;

  const currentYear = jstYear(new Date());
  const set = (patch: Partial<WizardSelections>) => setSel((prev) => ({ ...prev, ...patch }));

  const childCount = sel.childrenBirthYears?.length;
  const setChildCount = (n: number) => {
    const prev = sel.childrenBirthYears ?? [];
    const next = Array.from({ length: n }, (_, i) => prev[i] ?? currentYear - 3);
    set({ childrenBirthYears: next });
  };
  const setChildYear = (i: number, y: number) => {
    const next = [...(sel.childrenBirthYears ?? [])];
    next[i] = y;
    set({ childrenBirthYears: next });
  };

  const stepValid = (): boolean => {
    switch (step) {
      case 0:
        return sel.selfBirthYear !== undefined && sel.selfEmployment !== undefined;
      case 1:
        return (
          sel.hasSpouse !== undefined &&
          sel.childrenBirthYears !== undefined &&
          (!sel.hasSpouse ||
            (sel.spouseBirthYear !== undefined && sel.spouseEmployment !== undefined)) &&
          (sel.childrenBirthYears.length === 0 || sel.educationPlan !== undefined)
        );
      case 2:
        return sel.selfIncome !== undefined && (!sel.hasSpouse || sel.spouseIncome !== undefined);
      case 3:
        return sel.assets !== undefined && sel.livingCost !== undefined;
      case 4:
        return (
          sel.housing !== undefined &&
          (sel.housing !== "own_loan" || (sel.loan !== undefined && sel.danshin !== undefined))
        );
      case 5:
        return (
          sel.coverageSelf !== undefined && (!sel.hasSpouse || sel.coverageSpouse !== undefined)
        );
      default:
        return false;
    }
  };

  const goResult = () => router.push(`/result?${encodeSelections(sel)}`);

  return (
    <main className={s.page}>
      <div className={s.progress}>
        <div className={s.progressText}>
          ステップ {step + 1} / {TOTAL}
        </div>
        <div className={s.bar}>
          <div className={s.barFill} style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </div>
      </div>

      <h1 className={s.stepTitle}>{STEP_TITLES[step]}</h1>

      {step === 0 && (
        <>
          <fieldset className={s.field}>
            <legend className={s.legend}>あなたの生まれた年</legend>
            <div className={s.selectRow}>
              <YearSelect
                label="生年"
                value={sel.selfBirthYear}
                min={1940}
                max={currentYear - 18}
                onChange={(v) => set({ selfBirthYear: v })}
              />
            </div>
          </fieldset>
          <RadioGroup
            legend="働き方"
            options={EMPLOYMENT}
            value={sel.selfEmployment}
            onChange={(v) => set({ selfEmployment: v })}
          />
        </>
      )}

      {step === 1 && (
        <>
          <RadioGroup
            legend="配偶者はいますか？"
            options={[
              ["yes", "いる"],
              ["no", "いない"],
            ]}
            value={sel.hasSpouse === undefined ? undefined : sel.hasSpouse ? "yes" : "no"}
            onChange={(v) => set({ hasSpouse: v === "yes" })}
          />
          {sel.hasSpouse && (
            <>
              <fieldset className={s.field}>
                <legend className={s.legend}>配偶者の生まれた年</legend>
                <div className={s.selectRow}>
                  <YearSelect
                    label="生年"
                    value={sel.spouseBirthYear}
                    min={1940}
                    max={currentYear - 18}
                    onChange={(v) => set({ spouseBirthYear: v })}
                  />
                </div>
              </fieldset>
              <RadioGroup
                legend="配偶者の働き方"
                options={SPOUSE_EMPLOYMENT}
                value={sel.spouseEmployment}
                onChange={(v) => set({ spouseEmployment: v })}
              />
            </>
          )}
          <fieldset className={s.field}>
            <legend className={s.legend}>お子さんの人数</legend>
            <div className={s.selectRow}>
              <label className={s.select}>
                人数：
                <select
                  value={childCount ?? ""}
                  onChange={(e) => setChildCount(Number(e.target.value))}
                >
                  <option value="" disabled>
                    選択
                  </option>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}人
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {childCount !== undefined && childCount > 0 && (
              <div className={s.selectRow}>
                {Array.from({ length: childCount }, (_, i) => (
                  <YearSelect
                    // biome-ignore lint/suspicious/noArrayIndexKey: 子は末尾で増減するだけで並びが安定
                    key={i}
                    label={`お子さん${i + 1}の生年`}
                    value={sel.childrenBirthYears?.[i]}
                    min={currentYear - 30}
                    max={currentYear}
                    onChange={(y) => setChildYear(i, y)}
                  />
                ))}
              </div>
            )}
          </fieldset>
          {childCount !== undefined && childCount > 0 && (
            <RadioGroup
              legend="お子さんの進路の見通し"
              note="教育費の目安に使います。決めていなければ「まだ決めていない」で大丈夫です（公立中心で仮に計算します）。"
              options={EDU_PLAN}
              value={sel.educationPlan}
              onChange={(v) => set({ educationPlan: v })}
            />
          )}
        </>
      )}

      {step === 2 && (
        <>
          <RadioGroup
            legend="あなたの年収（税込み）"
            options={INCOME}
            value={sel.selfIncome}
            onChange={(v) => set({ selfIncome: v })}
          />
          {sel.hasSpouse && (
            <RadioGroup
              legend="配偶者の年収（税込み）"
              options={SPOUSE_INCOME}
              value={sel.spouseIncome}
              onChange={(v) => set({ spouseIncome: v })}
            />
          )}
        </>
      )}

      {step === 3 && (
        <>
          <RadioGroup
            legend="世帯の金融資産（貯金・投資などの合計）"
            options={ASSETS}
            value={sel.assets}
            onChange={(v) => set({ assets: v })}
          />
          <RadioGroup
            legend="毎月の生活費"
            note="家賃などの住居費は含めて、住宅ローンの返済は除いた金額でお答えください。"
            options={LIVING}
            value={sel.livingCost}
            onChange={(v) => set({ livingCost: v })}
          />
        </>
      )}

      {step === 4 && (
        <>
          <RadioGroup
            legend="お住まい"
            options={HOUSING}
            value={sel.housing}
            onChange={(v) => set({ housing: v })}
          />
          {sel.housing === "own_loan" && (
            <>
              <RadioGroup
                legend="住宅ローンの残高"
                options={LOAN}
                value={sel.loan}
                onChange={(v) => set({ loan: v })}
              />
              <RadioGroup
                legend="団信（だんしん）に入っていますか？"
                note="団信＝住宅ローンの保険。契約者が亡くなると、残りのローンがゼロになるしくみです。"
                options={DANSHIN}
                value={sel.danshin}
                onChange={(v) => set({ danshin: v })}
              />
            </>
          )}
        </>
      )}

      {step === 5 && (
        <>
          <RadioGroup
            legend="あなたが亡くなったときに受け取れる死亡保険金（合計）"
            note="いま入っている生命保険で、あなたを対象（被保険者）にしている保障額の合計です。分からなければ「分からない」で進めます。"
            options={COVERAGE}
            value={sel.coverageSelf}
            onChange={(v) => set({ coverageSelf: v })}
          />
          {sel.hasSpouse && (
            <RadioGroup
              legend="配偶者が亡くなったときに受け取れる死亡保険金（合計）"
              note="配偶者を対象（被保険者）にしている保障額の合計です。本人の分と混ぜないよう、分けてお聞きしています。"
              options={COVERAGE}
              value={sel.coverageSpouse}
              onChange={(v) => set({ coverageSpouse: v })}
            />
          )}
          <p className={s.helper}>
            保険証券の写真から自動で読み取る入力は準備中です。いまは金額を選んでお答えください。
          </p>
        </>
      )}

      <div className={s.actions}>
        <button
          type="button"
          className={s.secondary}
          onClick={() => setStep((n) => Math.max(0, n - 1))}
          disabled={step === 0}
        >
          戻る
        </button>
        {step < TOTAL - 1 ? (
          <button
            type="button"
            className={s.primary}
            onClick={() => setStep((n) => n + 1)}
            disabled={!stepValid()}
          >
            次へ
          </button>
        ) : (
          <button
            type="button"
            className={s.primary}
            onClick={goResult}
            disabled={!isComplete(sel)}
          >
            結果を見る
          </button>
        )}
      </div>
      <p className={s.helper}>
        入力の途中でも、このページのURLをブックマークすれば続きから再開できます。
      </p>
    </main>
  );
}
