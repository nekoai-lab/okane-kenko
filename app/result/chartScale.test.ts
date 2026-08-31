/**
 * 目盛りの丸め方を固定する。
 * 「3,847万円」のような目盛りが出ると図が一気に素人くさくなるが、
 * 目視では気づきにくいのでテストで押さえる。
 */
import { describe, expect, it } from "vitest";
import { linearScale, niceStep } from "./chartScale.js";

const MAN = 10_000;

describe("niceStep", () => {
  it("1・2・5・10 × 10^n に丸める", () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(23)).toBe(50);
    expect(niceStep(1234)).toBe(2000);
  });

  it("0 や不正な値でも壊れない", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });
});

describe("linearScale", () => {
  it("目盛りが丸い数字になり、データを内側に含む", () => {
    const s = linearScale(0, 3847 * MAN);
    expect(s.lo).toBe(0);
    expect(s.hi).toBeGreaterThanOrEqual(3847 * MAN);
    // すべての目盛りが刻み幅の倍数
    const step = s.ticks[1] - s.ticks[0];
    for (const t of s.ticks) expect(t % step).toBe(0);
  });

  it("マイナスを含むと下端がマイナス側に丸められる", () => {
    const s = linearScale(-265 * MAN, 235 * MAN);
    expect(s.lo).toBeLessThanOrEqual(-265 * MAN);
    expect(s.hi).toBeGreaterThanOrEqual(235 * MAN);
    expect(s.ticks).toContain(0); // 0 の線が必ず引ける
  });

  it("pos は下端で0、上端で1になる", () => {
    const s = linearScale(0, 1000 * MAN);
    expect(s.pos(s.lo)).toBeCloseTo(0);
    expect(s.pos(s.hi)).toBeCloseTo(1);
  });

  it("全部同じ値でも軸が潰れない", () => {
    const s = linearScale(500 * MAN, 500 * MAN);
    expect(s.hi).toBeGreaterThan(s.lo);
    expect(s.ticks.length).toBeGreaterThan(1);
  });
});
