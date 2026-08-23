/**
 * 結果ページ（T-03 時点は最小・本作り込みは T-05）
 *
 * サーバコンポーネント。URL の区分コードを decode →（サーバ側で params を読んで）normalize → diagnose。
 * クライアントに params を持たせず、算定は src/calc に閉じる（責務境界）。
 * ここでは「入力→算定の一本道が通っていること」を確認できる最小表示にとどめる。
 */
import Link from "next/link";
import { diagnose } from "../../src/calc/index.js";
import { loadParams } from "../../src/params/index.js";
import { toCompleteSelections } from "../../src/wizard/complete.js";
import { normalize } from "../../src/wizard/normalize.js";
import { decodeSelections } from "../../src/wizard/url.js";
import s from "./page.module.css";

const HEADLINE: Record<string, { icon: string; label: string; tone: "good" | "warn" }> = {
  all_covered: { icon: "✓", label: "いまの前提では、足りています", tone: "good" },
  reducible: { icon: "💡", label: "減らせる余地がありそうです", tone: "good" },
  rebalanceable: { icon: "🔁", label: "世帯全体で見直せそうです", tone: "good" },
  shortage: { icon: "⚠", label: "足りない可能性があります", tone: "warn" },
};

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(sp)) {
    if (typeof val === "string") q.set(k, val);
  }

  const sel = decodeSelections(q);
  const complete = toCompleteSelections(sel);
  if (!complete) {
    return (
      <main className={s.page}>
        <p>入力がまだ足りていないようです。</p>
        <Link className={s.link} href={`/wizard?${q.toString()}`}>
          入力に戻る
        </Link>
      </main>
    );
  }

  const params = loadParams();
  const { input, estimations } = normalize(params, complete, new Date());
  const result = diagnose(params, input);

  // いまの保険が分からない側があると過不足は保留（pending）。
  // このとき householdHeadline は「足りている」に潰れて見えるので、保留として正直に出す。
  const anyPending = [result.self.gap, result.spouse?.gap].some((g) => g?.kind === "pending");
  const h = anyPending ? null : (HEADLINE[result.householdHeadline.kind] ?? HEADLINE.shortage);

  return (
    <main className={s.page}>
      {h ? (
        <div className={`${s.headline} ${h.tone === "good" ? s.good : s.warn}`}>
          <span className={s.icon} aria-hidden="true">
            {h.icon}
          </span>
          <span>{h.label}</span>
        </div>
      ) : (
        <div className={`${s.headline} ${s.pending}`}>
          <span className={s.icon} aria-hidden="true">
            ℹ
          </span>
          <span>
            いまの保険内容が分からないので、過不足はまだ出していません。必要な保障額の目安だけお見せします。証券が見つかったら再診断できます。
          </span>
        </div>
      )}

      <p className={s.meta}>
        これは<strong>概算・要精査</strong>です／算定基準日：{new Date().toISOString().slice(0, 10)}
        ／使用パラメータ版：{result.paramVersion}
      </p>

      {estimations.length > 0 && (
        <>
          <p className={s.meta}>推定で補った項目：</p>
          <ul className={s.list}>
            {estimations.map((e) => (
              <li key={e.field}>{e.note}</li>
            ))}
          </ul>
        </>
      )}

      <div className={s.draftNote}>
        詳しい結果画面（内訳・減らせる箇所・スライダーなど）は準備中です（T-05）。
        <br />
        <Link className={s.link} href={`/wizard?${q.toString()}`}>
          入力をやり直す
        </Link>
      </div>
    </main>
  );
}
