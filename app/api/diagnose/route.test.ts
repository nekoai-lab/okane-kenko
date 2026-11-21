/**
 * POST /api/diagnose の前段の長さ確認（GHSA-mrhx-c7xc-m3w5）
 *
 * 上限を超える children は zod の検証に入る前に 400 で返すことを、ハンドラーを通して確かめる。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOLDEN } from "../../../src/__tests__/households.js";
import { POST } from "./route.js";
import { DiagnoseRequestSchema, MAX_CHILDREN } from "./schema.js";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/diagnose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/diagnose の前段の長さ確認", () => {
  const gt01 = GOLDEN.find((c) => c.id === "GT-01");
  if (!gt01) throw new Error("GT-01 が households.ts に見つかりません");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("children が上限を超えると zod を呼ばずに 400 を返す", async () => {
    const spy = vi.spyOn(DiagnoseRequestSchema, "safeParse");
    const res = await post({ ...gt01.input, children: Array(MAX_CHILDREN + 1).fill(0) });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; issues?: unknown };
    expect(json.error).toBe("invalid_input");
    expect(json.issues).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("上限ちょうどなら前段では弾かず、zod の検証に進む", async () => {
    const spy = vi.spyOn(DiagnoseRequestSchema, "safeParse");
    await post({ ...gt01.input, children: Array(MAX_CHILDREN).fill(0) });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
