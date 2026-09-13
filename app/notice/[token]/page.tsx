/**
 * 通知(Slack)から戻ってきたときの着地画面(UI案A)。
 *
 * ここではまだ金額を出さない。「詳しく見直す」を押した人だけ /result に進む(二段階同意)。
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { encodeSelections } from "../../../src/wizard/url.js";
import { createFirestoreWatchStore } from "../../../src/watch/store.firestore.js";
import { DeleteRecord } from "./DeleteRecord.js";
import s from "./page.module.css";

export default async function NoticePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const store = createFirestoreWatchStore();
  const household = await store.findByToken(token);
  if (!household) notFound();

  const query = encodeSelections(household.wizardSelections);

  return (
    <main className={s.page}>
      <p className={s.eyebrow}>お金ドクター</p>
      <h1 className={s.title}>お子さんの成長で、状況が変わっているかもしれません</h1>
      <p className={s.body}>前回の診断から時間が経っています。ここではまだ金額は出しません。</p>
      <Link className={s.primaryButton} href={`/result?${query}`}>
        詳しく見直す →
      </Link>
      <DeleteRecord token={token} />
    </main>
  );
}
