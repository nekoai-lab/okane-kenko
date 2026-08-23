/**
 * 制度パラメータの読み込みと有効期限チェック（ADR-004 / PR-01〜PR-04）
 *
 * 壊れ方が静かであることが最大の危険なので、「壊れたら止まる」設計にする。
 * 期限切れの中核パラメータで診断しようとしたら例外を投げ、古い値で黙って出さない。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface ParamEntry {
  value: number;
  unit?: string;
  label?: string;
  source?: string;
  note?: string;
  verified?: boolean;
  core?: boolean;
  userAdjustable?: boolean;
}

export interface KogakuBracket {
  name: string;
  minIncome: number;
  base: number;
  threshold: number;
  rate: number;
}

/**
 * レンジ選択→代表値の写像（DR-02）。制度パラメータではなく入力の正規化前提（当社基準）。
 * 値は円単位の整数。期限切れ・verified ゲートの対象外なので public/toBeSourced とは別に持つ。
 */
export interface InputRanges {
  income: Record<string, number>;
  assets: Record<string, number>;
  monthlyLiving: Record<string, number>;
  loan: Record<string, number>;
  /** 現在の死亡保障額（被保険者ごと）。証券記載の具体額なので中央値ではない */
  coverage: Record<string, number>;
}

export interface ParamSet {
  version: string;
  effectiveFrom: string;
  effectiveTo: string;
  public: Record<string, ParamEntry>;
  kogaku: {
    assumedMonthlyMedicalCost: number;
    brackets: KogakuBracket[];
    source: string;
    verified: boolean;
  };
  ownStandard: Record<string, ParamEntry>;
  toBeSourced: Record<string, ParamEntry>;
  constants: Record<string, number>;
  inputRanges: InputRanges;
}

export class ParamsExpiredError extends Error {
  constructor(
    public readonly version: string,
    public readonly expiredKeys: string[],
  ) {
    super(
      `制度パラメータ ${version} は有効期限を過ぎています（中核: ${expiredKeys.join(", ")}）。` +
        `古い値で診断を続けると、エラーを出さずに誤った金額を出し続けます。パラメータを更新してください。`,
    );
    this.name = "ParamsExpiredError";
  }
}

export class ParamsUnverifiedError extends Error {
  constructor(public readonly unverified: string[]) {
    super(
      `一次情報で未確認のパラメータが含まれています: ${unverified.join(", ")}。` +
        `本番では verified: false のまま診断してはいけません（PR-02）。`,
    );
    this.name = "ParamsUnverifiedError";
  }
}

const DEFAULT_PARAMS_DIR = join(process.cwd(), "params");

export function loadParams(version = "2026-08", dir = DEFAULT_PARAMS_DIR): ParamSet {
  const raw = readFileSync(join(dir, `${version}.yaml`), "utf-8");
  return parse(raw) as ParamSet;
}

/** 便宜アクセサ：セクションをまたいで値だけ引く */
export function v(p: ParamSet, key: string): number {
  for (const section of [p.public, p.ownStandard, p.toBeSourced]) {
    if (section && key in section) return section[key].value;
  }
  if (p.constants && key in p.constants) return p.constants[key];
  throw new Error(`パラメータが見つかりません: ${key}`);
}

/**
 * 有効期限チェック（PR-04）。
 * @param asOf 判定日
 * @param opts.strictVerified true なら verified:false のパラメータでも停止する（本番用）
 */
export function assertUsable(
  p: ParamSet,
  asOf: Date,
  opts: { strictVerified?: boolean } = {},
): void {
  const to = new Date(`${p.effectiveTo}T23:59:59+09:00`);
  if (asOf > to) {
    const coreKeys = Object.entries(p.public)
      .filter(([, e]) => e.core)
      .map(([k]) => k);
    throw new ParamsExpiredError(p.version, coreKeys);
  }
  if (opts.strictVerified) {
    const unverified = [...Object.entries(p.public), ...Object.entries(p.toBeSourced)]
      .filter(([, e]) => e.verified === false)
      .map(([k]) => k);
    if (unverified.length > 0) throw new ParamsUnverifiedError(unverified);
  }
}

/** 結果画面で「当社基準」として明示し、本人が動かせる値の一覧（ADR-014） */
export function userAdjustableParams(p: ParamSet): Array<{ key: string } & ParamEntry> {
  return Object.entries(p.ownStandard)
    .filter(([, e]) => e.userAdjustable)
    .map(([key, e]) => ({ key, ...e }));
}
