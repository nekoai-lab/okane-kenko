/**
 * 監視対象の許可リスト（フェーズ2b）。
 *
 * **許可リストにないURLは取りに行かない。** 取得したページ内のリンクも辿らない（1ホップだけ）。
 * リダイレクト先がリスト外のホストなら破棄する。
 * 外部サイトを読む以上、ここが最初の防壁になる。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface WatchTarget {
  /** `params/*.yaml` の public セクションのキー */
  key: string;
  label: string;
  /** 金額を1つだけ捕まえる正規表現（捕捉グループ1が値） */
  pattern: string;
  /** 画面に出す単位（既定は「円」）。金額でない値（給付制限の月数など）に付ける */
  unit?: string;
  /** 取り違え検知の幅。外れたら提案を作らず止める */
  min: number;
  max: number;
}

export interface Watch {
  label: string;
  sources: string[];
  targets: WatchTarget[];
}

export interface WatchSources {
  version: string;
  watches: Record<string, Watch>;
}

const DEFAULT_PARAMS_DIR = join(process.cwd(), "params");

export function loadWatchSources(dir = DEFAULT_PARAMS_DIR): WatchSources {
  const raw = readFileSync(join(dir, "watch-sources.yaml"), "utf-8");
  return parse(raw) as WatchSources;
}

/**
 * このURLを取りに行ってよいか。**完全一致ではなくホストで見る**のは、
 * 同じ告示ページがクエリ付きで案内されることがあるため。パスまでは一致を求める。
 */
export function isAllowed(url: string, watch: Watch): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (target.protocol !== "https:") return false;
  return watch.sources.some((s) => {
    const allowed = new URL(s);
    return allowed.host === target.host && allowed.pathname === target.pathname;
  });
}
