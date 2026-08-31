"use client";

/**
 * 当社基準スライダー（ADR-014）：主要な前提（毎月の生活費）を本人が動かすと、
 * 必要な保障額がどう変わるかをその場で見せる。数値は作らず、既存の /api/diagnose
 * （＝src/calc）に投げ直して受け取るだけ（責務境界を守る）。
 *
 * **現状と変更後を並べる。** 値が入れ替わるだけだと「動かした結果どう変わったか」が
 * 分からず、前提を試す意味が薄れる。FPの実務資料が必ず現状（例1）と変更（例2）を
 * 重ねて出しているのと同じ理由（2026-08-31）。
 *
 * 表示は検査値パネルと同じ罫線の型を使い回す。画面の中で同じ役割のものが
 * 別の見た目で出てくると、そのたび読み方を覚え直すことになる。
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

  const changed = man !== baseMan;
  // 差は下限・上限それぞれで見る（片方だけ見ると動きを取り違える）
  const dLow = range.low - initialLow;
  const dHigh = range.high - initialHigh;
  const delta =
    dLow === 0 && dHigh === 0
      ? "現状と変わりません"
      : `現状より ${formatRange(Math.abs(dLow), Math.abs(dHigh))} ${dLow >= 0 && dHigh >= 0 ? "増えます" : "減ります"}`;

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
      <dl className={`${s.vitals} ${s.vitalsTwo}`}>
        <div className={s.vitalTile}>
          <dt className={s.vitalLabel}>現状（月{baseMan}万円）</dt>
          <dd className={s.vitalValue}>{formatRange(initialLow, initialHigh)}</dd>
          <p className={s.vitalNote}>ご入力どおりの前提</p>
        </div>
        <div className={s.vitalTile}>
          <dt className={s.vitalLabel}>変更後（月{man}万円）</dt>
          <dd className={s.vitalValue}>
            {changed ? formatRange(range.low, range.high) : "—"}
            {loading ? <span className={s.basis}> 計算中…</span> : null}
          </dd>
          <p className={s.vitalNote}>{changed ? delta : "スライダーを動かすとここに出ます"}</p>
        </div>
      </dl>

      {changed ? (
        <button className={s.resetBtn} onClick={() => onChange(baseMan)} type="button">
          入力値（月{baseMan}万円）に戻す
        </button>
      ) : null}
      <p className={s.basis}>
        ※ 生活費は「当社基準」の前提です。ここを動かした試算で、確定値ではありません。
      </p>
    </div>
  );
}
