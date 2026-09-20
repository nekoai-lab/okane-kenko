/**
 * 入口ページ（社員が最初に開く画面）
 *
 * ここまで `/` は T-02 時代のプレースホルダ（「準備中です」）のままで、
 * 本体の `/wizard` へのリンクすら無かった。URL を直打ちしない限り誰も
 * 診断にたどり着けない＝**動いているのに動いていないように見える**状態だった。
 *
 * 書いてよいこと・いけないことは CLAUDE.md の「事業の芯」に従う。
 * 商品名も申込み導線も置かない。急かす言葉（いますぐ・絶対に）も使わない。
 * 「保険を売らない」は宣伝ではなく、この診断を信じてよい理由なので最初に置く。
 */
import Link from "next/link";
import s from "./page.module.css";

export default function Home() {
  return (
    <main className={s.page}>
      <h1 className={s.title}>お金の健康診断</h1>

      <p className={s.lead}>
        あなたに万一のことがあったとき、ご家族に必要なお金はいくらか。
        <strong>いまの保険で足りているか、多すぎないか。</strong>
        公的なしくみ（遺族年金や高額療養費など）をふまえて概算します。
      </p>

      {/* **CTA を「読み終わってから」に置かない。** 何のサービスかが分かった直後に
          押せる場所を作る。理由（売らない・選ぶだけ・再開できる）は下で読めばよい。 */}
      <div className={s.ctaBlock}>
        <Link className={s.cta} href="/wizard">
          診断をはじめる
        </Link>
        <p className={s.ctaNote}>
          10問ほど、選ぶだけ。<strong>登録もメールアドレスも要りません。</strong>
        </p>
      </div>

      <ul className={s.points}>
        <li className={`${s.point} ${s.pointLead}`}>
          <p className={s.pointTitle}>保険を売りません</p>
          <p className={s.pointBody}>
            この診断は保険の申込みにつなぎません。商品名も出しません。
            成約の手数料を受け取らないので、必要がなければ「入らなくていい」と言えます。
          </p>
        </li>
        <li className={s.point}>
          {/* 問数は CTA の下に書いた。ここは「答えられない質問があっても大丈夫」に絞る。
              正確に答えられないことが、やめる理由のいちばん多い形なので。 */}
          <p className={s.pointTitle}>「分からない」も答えになります</p>
          <p className={s.pointBody}>
            金額は範囲から選びます。「分からない」「答えたくない」を選んでも診断は進み、
            どこを推定で補ったかは結果画面に残します。
          </p>
        </li>
        <li className={s.point}>
          <p className={s.pointTitle}>途中でやめても続きから再開できます</p>
          <p className={s.pointBody}>
            答えはページのURLに残ります。金額そのものはURLに載せていません。
          </p>
        </li>
      </ul>

      <ul className={s.notes}>
        <li>
          結果は「<strong>必要な額</strong>」「<strong>いまの保障との差</strong>」「
          <strong>減らせる箇所</strong>」を、根拠（計算の内訳と出典）つきで出します。
        </li>
        <li>
          ただし<strong>概算・要精査</strong>です。確定した金額ではありません。
        </li>
        {/* 「検証版です」はページ上部のバナーが担う（app/layout.tsx）。
            未確認パラメータの有無から自動で出るので、ここに二重に書かない。 */}
        <li>使った前提・出典・推定で補った項目は、結果画面にすべて表示します。</li>
      </ul>
    </main>
  );
}
