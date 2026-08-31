"use client";

/**
 * 当社基準スライダー（ADR-014）：主要な前提（毎月の生活費）を本人が動かすと、
 * 必要な保障額がどう変わるかをその場で見せる。数値は作らず、既存の /api/diagnose
 * （＝src/calc）に投げ直して受け取るだけ（責務境界を守る）。
 */
import { useEffect, useRef, useState } from "react";
import type { DiagnoseInput } from "../../src/calc/index.js";
import { formatRange } from "../../src/design/tokens.js";
import s from "./page.module.css";

export function LivingCostSlider({
  input,
  initialLow,
  initialHigh,
}: {
  input: DiagnoseInput;
  initialLow: number;
  initialHigh: number;
}) {
  const baseMan = Math.round(input.monthlyLiving / 10000);
  const [man, setMan] = useState(baseMan);
  const [range, setRange] = useState({ low: initialLow, high: initialHigh });
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function onChange(nextMan: number) {
    setMan(nextMan);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, monthlyLiving: nextMan * 10000 }),
        });
        if (res.ok) {
          const d = await res.json();
          setRange({ low: d.self.range.low, high: d.self.range.high });
        }
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  return (
    <div className={s.sliderBox}>
      <h2 className={s.h2}>前提を動かしてみる（当社基準）</h2>
      <label className={s.sliderLabel}>
        毎月の生活費：<strong>{man}万円</strong>
        <input
          type="range"
          min={15}
          max={45}
          step={1}
          value={man}
          onChange={(e) => onChange(Number(e.target.value))}
          className={s.slider}
        />
      </label>
      <div className={s.sliderResult}>
        必要な保障額（あなた）：<strong>{formatRange(range.low, range.high)}</strong>
        {loading ? <span className={s.basis}> 計算中…</span> : null}
        {man !== baseMan ? (
          <button type="button" className={s.resetBtn} onClick={() => onChange(baseMan)}>
            入力値（{baseMan}万円）に戻す
          </button>
        ) : null}
      </div>
      <p className={s.basis}>
        ※ 生活費は「当社基準」の前提です。ここを動かした試算で、確定値ではありません。
      </p>
    </div>
  );
}
