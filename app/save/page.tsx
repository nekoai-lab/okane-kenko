/**
 * 初回保存の同意画面(UI案2・独立した確認画面)。
 *
 * /result と同じ区分コードを URL から受け取り、入力が完全かどうかだけ確認する。
 * 金額の再計算はここではしない(保存の可否だけを判断する画面のため)。
 */
import Link from "next/link";
import { toCompleteSelections } from "../../src/wizard/complete.js";
import { decodeSelections } from "../../src/wizard/url.js";
import { SaveConsent } from "./SaveConsent.js";
import s from "./page.module.css";

export default async function SavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(sp)) {
    if (typeof val === "string") q.set(k, val);
  }

  const complete = toCompleteSelections(decodeSelections(q));
  if (!complete) {
    return (
      <main className={s.page}>
        <p>この結果を保存できませんでした。診断からやり直してください。</p>
        <Link className={s.link} href="/wizard">
          診断をはじめからやり直す
        </Link>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <h1 className={s.title}>この結果を保存しますか？</h1>
      <p className={s.body}>
        保存すると、お子さんの成長など状況が変わったときにSlackで一言お知らせできます。
        保存する内容は今日の入力(レンジ値)と結果の要点だけです。金額の詳細は毎回お知らせせず、
        見に来たときだけ出します。いつでも削除できます。
      </p>
      <SaveConsent query={q.toString()} />
    </main>
  );
}
