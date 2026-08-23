/**
 * POST /api/diagnose のリクエスト検証（T-02）
 *
 * API は外部からの信頼できない JSON を受ける。ここで zod により形と範囲を検証し、
 * 通ったものだけを算定エンジンの DiagnoseInput として扱う。
 * スキーマの推論型が DiagnoseInput に代入可能であることを、ファイル末尾で型レベルに固定する。
 * 金額はすべて円単位の整数（CLAUDE.md コーディング規約）。
 */
import { z } from "zod";
import type { DiagnoseInput } from "../../../src/calc/index.js";

const yen = z.number().int().nonnegative();

const PersonSchema = z.object({
  age: z.number().int().positive(),
  income: yen,
  employment: z.enum(["employee", "self", "none"]),
});

const HousingSchema = z.object({
  type: z.enum(["own", "rent"]),
  loan: yen.optional(),
  danshin: z.boolean().optional(),
});

export const DiagnoseRequestSchema = z.object({
  self: PersonSchema,
  spouse: PersonSchema.nullable(),
  children: z.array(z.number().int().nonnegative()),
  housing: HousingSchema,
  assets: yen,
  monthlyLiving: yen,
  educationPlan: z.enum(["public", "mixed", "private"]),
  // 不明なら null。過不足判定は pending になる（FR-14）。
  coverageSelf: yen.nullable(),
  // undefined = まだ聞いていない（配偶者診断を保留）。null = 聞いたが不明。
  coverageSpouse: yen.nullable().optional(),
});

export type DiagnoseRequest = z.infer<typeof DiagnoseRequestSchema>;

// スキーマがエンジンの入力契約からずれたらコンパイルで気づけるようにする。
const _typecheck: DiagnoseInput = {} as DiagnoseRequest;
void _typecheck;
