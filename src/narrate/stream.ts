/**
 * ストリーミング表示のための純粋関数（T-07）。
 *
 * AIに書かせるのは「プレースホルダだけのテンプレ」なので、途中まで届いたテンプレにも
 * その時点で差し込める。ただし `{{selfRa` のように**プレースホルダが途中で切れている**間に
 * 差し込むと、壊れた文字列がそのまま画面に出る。ここはその境目を扱う。
 *
 * 依存を持たない（クライアント側でもそのまま使う）。
 */

/** テンプレに差し込む値。作るのは算定エンジン側（ここでは受け取るだけ） */
export type PlaceholderValues = Record<string, string>;

/**
 * 途中まで届いたテンプレを、表示できる形にする。
 * - 閉じているプレースホルダは差し込む
 * - 末尾の「開きかけのプレースホルダ」は、閉じるまで表示しない（壊れた表示を出さない）
 */
export function renderStreamed(partialTemplate: string, values: PlaceholderValues): string {
  const open = partialTemplate.lastIndexOf("{{");
  const close = partialTemplate.lastIndexOf("}}");
  // 最後の "{{" が閉じていなければ、そこから先は伏せる。"{" 1文字だけの途中も同様に伏せる。
  let visible = open > close ? partialTemplate.slice(0, open) : partialTemplate;
  if (visible.endsWith("{")) visible = visible.slice(0, -1);
  return visible.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, k: string) => values[k] ?? "");
}
