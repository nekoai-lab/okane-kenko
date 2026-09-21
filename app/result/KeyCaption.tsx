/**
 * キー・バリュー型のキャプション（2026-09-21 オーナー決定）
 *
 * **「←『子2人』から」という記法をやめ、`回答: 子2人` に統一する。**
 * STEP3 の `出典: 日本年金機構` と同じ形にそろえる ──
 * **2つの記法が混ざっているのが、いちばん読みにくい**。
 *
 * 組版は出典バッジと同じトークン（サイズ・墨の薄さ）で、**枠は付けずテキストのみ**。
 * キー（`回答:`）はバリューより**もう一段薄く**する ── 毎行に出る定型部分なので、
 * 目に入る必要があるのは値のほう。
 *
 * **台帳・滝など、出どころを示すすべての場所でこれを使う。**
 * 場所ごとに別のマークアップを書くと、また記法が分かれる。
 */
import s from "./keyCaption.module.css";

export function KeyCaption({ label, value }: { label: string; value: string }) {
  return (
    <span className={s.caption}>
      <span className={s.key}>{label}:</span>
      <span className={s.value}>{value}</span>
    </span>
  );
}
