/**
 * 承認画面（フェーズ2b）。
 *
 * **この画面で承認しても `params/` は1バイトも変わらない。**
 * 承認は「人間が確認した」という記録で、YAML の更新は人間が PR で行う。
 * そのことを画面にも書く（裏で適用されていると誤解されたら、この設計の意味が消える）。
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, checkToken } from "../../../src/paramwatch/auth.js";
import { createFirestoreProposalStore } from "../../../src/paramwatch/store.firestore.js";
import s from "./page.module.css";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function man(yen: number): string {
  return `${Math.round(yen / 10000).toLocaleString()}万円`;
}

export default async function ProposalsPage() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!checkToken(token, process.env.ADMIN_PASSWORD)) redirect("/admin/login");

  const store = createFirestoreProposalStore();
  const [proposals, runLog] = await Promise.all([store.listProposals(), store.listRunLog(20)]);
  const pending = proposals.filter((p) => p.status === "pending");

  return (
    <main className={s.page}>
      <h1 className={s.title}>制度パラメータの変更提案</h1>

      <p className={s.notice}>
        <strong>承認しても、このシステムは `params/` を書き換えません。</strong>
        承認は「人が確認した」という記録です。値の反映は、人が YAML を直して PR を出します。
        監視は提案を積むところまでしかできません（取り消せる操作しか持たせていません）。
      </p>

      {pending.length === 0 ? (
        <p className={s.empty}>承認待ちはありません。</p>
      ) : (
        pending.map((p) => (
          <section className={s.card} key={p.id}>
            <h2 className={s.h2}>{p.label}</h2>

            <table className={s.table}>
              <thead>
                <tr>
                  <th>パラメータ</th>
                  <th>いまの値</th>
                  <th>提案</th>
                </tr>
              </thead>
              <tbody>
                {p.changes.map((c) => (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    <td className={s.num}>{c.current.toLocaleString()}円</td>
                    <td className={s.num}>{c.proposed.toLocaleString()}円</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className={s.h3}>影響（10世帯で再計算した結果）</h3>
            <p className={s.impact}>
              結論が変わる世帯：<strong>{p.impact.changedCount}</strong> /{" "}
              {p.impact.households.length} 件
              {p.impact.changedCount === 0 ? "（＝利用者への通知はしません）" : null}
            </p>
            <ul className={s.list}>
              {p.impact.households
                .filter((h) => h.changed || h.needBefore !== h.needAfter)
                .slice(0, 5)
                .map((h) => (
                  <li key={h.id}>
                    {h.id}：必要額 {man(h.needBefore)} → {man(h.needAfter)}
                    {h.changed ? `／結論 ${h.headlineBefore} → ${h.headlineAfter}` : ""}
                  </li>
                ))}
            </ul>

            <h3 className={s.h3}>根拠</h3>
            <p className={s.basis}>
              取得元：
              <a className={s.link} href={p.sourceUrl} rel="noreferrer" target="_blank">
                {p.sourceUrl}
              </a>
              （{p.fetchedAt}）
            </p>
            <ul className={s.list}>
              {p.matchedTexts.map((t) => (
                <li className={s.quote} key={t}>
                  「{t}」
                </li>
              ))}
            </ul>

            {p.injectionSuspected.length > 0 ? (
              <p className={s.injection}>
                ⚠ 取得した本文に<strong>指示らしき文字列</strong>が{p.injectionSuspected.length}{" "}
                件ありました（{p.injectionSuspected.join(" / ")}）。
                <strong>従っていません。</strong>
                金額は本文から正規表現で取り出しており、AI は読んでいません。
              </p>
            ) : null}

            <details className={s.log}>
              <summary>行動ログ（{p.actionLog.length} 件）</summary>
              <ol className={s.list}>
                {p.actionLog.map((a) => (
                  <li key={`${a.at}-${a.step}`}>
                    <code>{a.step}</code>（{a.ms}ms）：{a.input} → {a.output}
                  </li>
                ))}
              </ol>
            </details>

            {p.impact.safe ? (
              <form action={`/api/admin/proposals/${p.id}`} className={s.actions} method="post">
                <button className={s.approve} name="decision" type="submit" value="approved">
                  確認した（記録に残す）
                </button>
                <button className={s.reject} name="decision" type="submit" value="rejected">
                  見送る
                </button>
              </form>
            ) : (
              <p className={s.blocked}>
                <strong>不変条件に落ちているため、承認ボタンは出しません。</strong>
                {p.impact.invariantFailures.map((f) => `${f.id}: ${f.what}`).join(" / ")}
              </p>
            )}
          </section>
        ))
      )}

      <h2 className={s.h2}>実行ログ（沈黙も残す）</h2>
      <ul className={s.list}>
        {runLog.map((r) => (
          <li key={`${r.runAt}-${r.watchKey}`}>
            {r.runAt}／{r.watchKey}／<strong>{r.decision}</strong>：{r.detail}
          </li>
        ))}
      </ul>
    </main>
  );
}
