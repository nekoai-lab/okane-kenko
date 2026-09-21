/**
 * 監査ログ（フェーズ2b・2026-09-22 D3）。
 *
 * **制度監視の全ツール呼び出しを、時系列で読めるようにする。**
 * 承認画面（/admin/proposals）は提案ごとの行動ログしか持たず、提案を作らなかった回
 * （沈黙・中断・失敗）の中身が読めなかった。沈黙も判断のうちなので、ここで回ごとに全部並べる。
 *
 * 表示するのは記録そのもの（入力・出力・所要時間・判断理由）。ここで要約や判断を足さない。
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, checkToken } from "../../../src/paramwatch/auth.js";
import { createFirestoreProposalStore } from "../../../src/paramwatch/store.firestore.js";
import s from "../proposals/page.module.css";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!checkToken(token, process.env.ADMIN_PASSWORD)) redirect("/admin/login");

  const runs = await createFirestoreProposalStore().listRunLog(50);

  return (
    <main className={s.page}>
      <h1 className={s.title}>制度監視の監査ログ</h1>

      <p className={s.notice}>
        巡回1回ごとに、呼んだツールを順に並べています（入力・出力・所要時間・判断理由）。
        提案を作らなかった回も残しています。
        <strong>
          判断理由は、決まった文か台帳・抽出結果から組み立てた文で、AI の作文ではありません。
        </strong>
        <br />
        <Link className={s.link} href="/admin/proposals">
          承認待ちの提案へ
        </Link>
      </p>

      {runs.length === 0 ? (
        <p className={s.empty}>記録はまだありません。</p>
      ) : (
        runs.map((r) => (
          <section className={s.card} key={`${r.runAt}-${r.watchKey}`}>
            <h2 className={s.h2}>
              {r.runAt}／{r.watchKey}／{r.decision}
            </h2>
            <p className={s.impact}>{r.detail}</p>
            {r.actionLog && r.actionLog.length > 0 ? (
              <ol className={s.list}>
                {r.actionLog.map((a) => (
                  <li key={`${a.at}-${a.step}`}>
                    <code>{a.step}</code>（{a.ms}ms）：{a.input} → {a.output}
                    {a.reason ? <div>判断理由：{a.reason}</div> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className={s.empty}>
                この回のツール呼び出しは記録されていません（2026-09-22 より前の記録です）。
              </p>
            )}
          </section>
        ))
      )}
    </main>
  );
}
