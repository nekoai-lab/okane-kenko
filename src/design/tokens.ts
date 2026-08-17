/**
 * デザイントークン（TypeScript版）
 *
 * SVG や canvas でグラフを描くときなど、CSS 変数を参照できない場所で使う。
 * 値は tokens.css と一致させること。片方だけ変えない。
 *
 * 出典：デジタル庁デザインシステム v2.17.0（Community）
 *       https://design.digital.go.jp/
 */

/** 判定に対応する色。色だけで意味を伝えないため、必ず label とセットで使う。 */
export const VERDICT_STYLE = {
  shortage: {
    label: "備えが足りていません",
    color: "#FB5B01",
    textColor: "#C74700",
    icon: "!",
    tone: "warning",
  },
  sufficient: {
    // 「ぎりぎり足りている」状態。良い知らせだが、前提が動くと変わる。
    // だから必ず「いまの前提では」を添え、何が変わると変わるかを示す。
    label: "いまの前提では、足りています",
    color: "#259D63",
    textColor: "#197A4B",
    icon: "✓",
    tone: "good-conditional",
  },
  ample: {
    label: "備えは足りています",
    color: "#259D63",
    textColor: "#197A4B",
    icon: "✓",
    tone: "good",
  },
  not_needed: {
    label: "いまは、保障がなくても大丈夫です",
    color: "#259D63",
    textColor: "#197A4B",
    icon: "✓",
    tone: "good",
  },
} as const;

/**
 * 「足りている」理由の帰属。
 *
 * 良い知らせは良い知らせとして届ける。ただし**本人の選択に帰属できるものだけを本人の手柄として書き**、
 * 制度のおかげの部分は「制度が効いています」と書く。
 * ここを混ぜて漠然と褒めると、根拠のないお世辞になり、一瞬で信用を失う。
 */
export type CreditSource = "own_choice" | "public_system" | "employer";

export const CREDIT_LABEL: Record<CreditSource, string> = {
  own_choice: "ご自身が積み上げてきたもの",
  public_system: "公的な制度が支えている分",
  employer: "勤務先の制度が支えている分",
};

/** 現在の保障との過不足 */
export const GAP_STYLE = {
  shortage: { label: "不足", color: "#FB5B01", textColor: "#C74700", icon: "!" },
  adequate: { label: "ちょうどよい", color: "#259D63", textColor: "#197A4B", icon: "✓" },
  excess: { label: "減らせます", color: "#259D63", textColor: "#197A4B", icon: "↓" },
  pending: { label: "判定を保留中", color: "#B3B3B3", textColor: "#4D4D4D", icon: "…" },
} as const;

/**
 * 結果画面の主グラフ（支出 vs 収入）の色。
 * 色相＝支出か収入かという意味を持つ。明度＝内訳の項目で、必ず直接ラベルを併記する。
 * セグメント間には 2px の背景色の隙間を空けること。
 */
export const CHART_EXPENSE = ["#C74700", "#E25100", "#FB5B01", "#FF7628", "#FFDFCA"] as const;
export const CHART_INCOME = ["#00118F", "#0031D8", "#3460FB", "#7096F8", "#C5D7FB"] as const;

/**
 * 系列の識別に使うカテゴリカルパレット。固定順で割り当て、循環させない。
 * 7系列目が必要になったら、色を増やすのではなく「その他」にまとめるか、
 * グラフを分割する。
 *
 * 検証済み（dataviz validator 全6項目 PASS）
 *  light（surface #fcfcfb）：明度帯・彩度下限・色覚特性の分離・通常視の分離・コントラスト
 *  dark （surface #1a1a19）：同上
 */
export const CHART_CATEGORICAL_LIGHT = [
  "#264AF4", // Blue-700
  "#E25100", // Orange-700
  "#259D63", // Green-600
  "#C000C0", // Magenta-700
  "#6FA104", // Lime-700
  "#008DA6", // Cyan-700
] as const;

export const CHART_CATEGORICAL_DARK = [
  "#4979F5", // Blue-500
  "#E25100", // Orange-700
  "#2CAC6E", // Green-500
  "#DB00DB", // Magenta-600
  "#6FA104", // Lime-700
  "#008DA6", // Cyan-700
] as const;

/** 連続量（1色相・淡→濃） */
export const CHART_SEQUENTIAL = ["#D9E6FF", "#9DB7F9", "#4979F5", "#264AF4", "#00118F"] as const;

export const CHART_INK = {
  surfaceLight: "#FFFFFF",
  surfaceDark: "#1A1A1A",
  gridLight: "#E6E6E6",
  gridDark: "#333333",
  axisTextLight: "#4D4D4D",
  axisTextDark: "#CCCCCC",
} as const;

/** 円を万円単位の表示文字列にする。単位を必ず付ける（情報設計のルール）。 */
export function formatMan(yen: number): string {
  return `${Math.round(yen / 10_000).toLocaleString("ja-JP")}万円`;
}

/** レンジ表示。点で断定せず、必ず「約」を付ける（FR-16 / CR-04） */
export function formatRange(low: number, high: number): string {
  if (low === high) return `約${formatMan(low)}`;
  return `約${Math.round(low / 10_000).toLocaleString("ja-JP")}〜${formatMan(high)}`;
}
