/**
 * 基準日の「日本時間での年」を返す。
 *
 * `Date.getFullYear()` は実行環境のタイムゾーンで年を返すため、同じ時刻でも
 * 開発機(JST)と Cloud Run / CI(UTC)で年が1つずれる。年齢は「年 − 生年」の
 * 簡略化で出しているので、ずれはそのまま1歳のずれになる。
 * 日本国内向けのサービスなので、どこで動いても JST の年で数える。
 */

/** JST は年間を通じて UTC+9（夏時間がない）ので、固定のオフセットで足りる */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstYear(d: Date): number {
  return new Date(d.getTime() + JST_OFFSET_MS).getUTCFullYear();
}

/**
 * 基準日の「日本時間での日付」（YYYY-MM-DD）。
 * `toISOString().slice(0, 10)` は UTC の日付なので、JST 0:00〜9:00 は前日になる（2026-09-22 に台帳の取得日で踏んだ）。
 */
export function jstDate(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}
