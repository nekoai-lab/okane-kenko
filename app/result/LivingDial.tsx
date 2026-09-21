/**
 * 暮らし方の前提トグル（仕様 §5.3・照合表 #4 / D-02・ADR-022）
 *
 * **リンクで作る。** クライアント状態を持たず、URL を変えてサーバで全部計算し直す。
 * 理由：#4 で最も起きやすい事故は**部分更新の取り残し**（一部だけ古い値が残る）で、
 * 「押したら全部が計算し直される」構造にすれば、取り残しが原理的に起きない。
 * リロードで保たれるのも、URL が状態そのものだから自動的に満たされる。
 *
 * **既定（いま通り）は URL に書かない**（`src/wizard/dial.ts`）。
 */
import Link from "next/link";
import type { LivingLevel } from "../../src/wizard/dial.js";
import s from "./livingDial.module.css";

/** ラベルとサブラベルは仕様 §4-6 の表と同文（「切り詰める＝今の7割」は誤りだった） */
const LABELS: Record<LivingLevel, { name: string; sub: string }> = {
  tight: { name: "切り詰める", sub: "いまの生活費から1割しぼる前提" },
  asis: { name: "いま通り", sub: "いまと同じ水準（既定）" },
  roomy: { name: "ゆとりを持つ", sub: "1割のゆとりを見る前提" },
};

export interface LivingDialProps {
  current: LivingLevel;
  /** 各目盛りに移動する URL（既定は `dial` を含まない） */
  hrefFor: (level: LivingLevel) => string;
  /**
   * 目盛りを動かしても必要額が変わらないときの1行。
   * **無反応ではなく「吸収されている」ことを伝える**（感度文と同じ分岐の作り）。
   */
  absorbedNote: string | null;
}

export function LivingDial({ current, hrefFor, absorbedNote }: LivingDialProps) {
  return (
    <section className={s.wrap} aria-labelledby="dial-heading">
      <p className={s.heading} id="dial-heading">
        暮らし方の前提
      </p>
      <div className={s.buttons}>
        {(Object.keys(LABELS) as LivingLevel[]).map((level) => {
          const on = level === current;
          return (
            <Link
              aria-current={on ? "true" : undefined}
              className={`${s.btn} ${on ? s.on : s.off}`}
              href={hrefFor(level)}
              key={level}
              replace
              scroll={false}
            >
              <span className={s.btnName}>{LABELS[level].name}</span>
              <span className={s.btnSub}>{LABELS[level].sub}</span>
            </Link>
          );
        })}
      </div>
      <p className={s.note}>目盛りを動かすと、下の計算と判定がすべて連動して変わります。</p>
      {absorbedNote && <p className={s.absorbed}>{absorbedNote}</p>}
    </section>
  );
}
