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
  /**
   * **デモ専用の watch**（罠ページなど・2026-09-22）。既定の読み込みでは除外する。
   * 本番の巡回（Scheduler）の許可リストに、デモ用のドメインを入れないため
   */
  demo?: boolean;
  sources: string[];
  targets: WatchTarget[];
}

export interface WatchSources {
  version: string;
  watches: Record<string, Watch>;
  /** 巡回しない値と、その理由（2026-09-22）。巡回されない値を台帳から読めるようにする */
  unwatched?: Array<{ key: string; reason: string }>;
}

const DEFAULT_PARAMS_DIR = join(process.cwd(), "params");

/**
 * 監視の台帳を読む。**デモ用の watch は `includeDemo` を明示したときだけ入れる**（2026-09-22・D3）。
 * 既定で入れると、罠ページのドメインが本番の許可リストに乗る。
 */
export function loadWatchSources(
  opts: { includeDemo?: boolean } = {},
  dir = DEFAULT_PARAMS_DIR,
): WatchSources {
  const raw = readFileSync(join(dir, "watch-sources.yaml"), "utf-8");
  const all = parse(raw) as WatchSources;
  if (opts.includeDemo) return all;
  return {
    ...all,
    watches: Object.fromEntries(Object.entries(all.watches).filter(([, w]) => !w.demo)),
  };
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
