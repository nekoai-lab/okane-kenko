/**
 * 和暦の日付を西暦（YYYY-MM-DD）にする（2026-09-22・D4）。**決定的な関数**。
 *
 * 台帳の施行日は、一次情報の一致文に書かれた日付からだけ作る。
 * 一次情報は「令和７年４月１日」のように和暦・全角で書くので、ここで写す。
 * 見つからなければ null（**無い日付を作らない**）。
 */
const ERA_BASE: Record<string, number> = { 令和: 2018, 平成: 1988, 昭和: 1925 };

function toAscii(s: string): string {
  return s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

/** 文中で最初に現れる和暦の日付。無ければ null */
export function firstWarekiDate(text: string): string | null {
  const m = toAscii(text).match(/(令和|平成|昭和)(元|[0-9]{1,2})年([0-9]{1,2})月([0-9]{1,2})日/);
  if (!m) return null;
  const n = m[2] === "元" ? 1 : Number(m[2]);
  const y = ERA_BASE[m[1]] + n;
  const mm = String(Number(m[3])).padStart(2, "0");
  const dd = String(Number(m[4])).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}
