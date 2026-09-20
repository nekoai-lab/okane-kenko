/**
 * 一次情報の取得（フェーズ2b）。**ここが唯一、外の世界に触る場所。**
 *
 * 守る線：
 * - 許可リストにないURLは取りに行かない
 * - **リダイレクト先がリスト外なら捨てる**（追いかけない＝1ホップだけ）
 * - 取得した本文は untrusted。**指示として解釈しうる経路を作らない**
 *   （金額の抽出は決定的なパーサがやるので、本文がプロンプトに入る経路そのものが無い）
 */
import { isAllowed, type Watch } from "./sources.js";

export interface FetchedPage {
  url: string;
  text: string;
  fetchedAt: string;
}

export type FetchOutcome =
  | { ok: true; page: FetchedPage }
  | {
      ok: false;
      why: "not_allowed" | "redirected_away" | "http_error" | "network";
      detail: string;
    };

/**
 * HTML をテキストにする。**整形の質は問わない**（正規表現で金額を拾えれば足りる）。
 * script / style を落とすのは、そこに紛れた文字列を本文として扱わないため。
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchSource(
  url: string,
  watch: Watch,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
  if (!isAllowed(url, watch)) {
    return { ok: false, why: "not_allowed", detail: "許可リストにないURL" };
  }

  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      headers: { "User-Agent": "okane-kenko-param-watch/1.0" },
      signal: AbortSignal.timeout(15_000),
    });

    // **リダイレクトの行き先も許可リストで見る。** 追いかけた先が別サイトなら捨てる
    if (res.url && !isAllowed(res.url, watch)) {
      return { ok: false, why: "redirected_away", detail: "リダイレクト先が許可リストの外" };
    }
    if (!res.ok) {
      return { ok: false, why: "http_error", detail: `HTTP ${res.status}` };
    }

    const html = await res.text();
    return {
      ok: true,
      page: { url: res.url || url, text: htmlToText(html), fetchedAt: now.toISOString() },
    };
  } catch (e) {
    return { ok: false, why: "network", detail: e instanceof Error ? e.message : String(e) };
  }
}
