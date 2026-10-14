/**
 * トップページ（ハッカソン紹介 LP v7 を組み込んだもの・2026-10-15）
 *
 * 元の単体 HTML（Codex 制作 okane-kenko-lp-v7.html）の構成・文面・見た目を移した。変えたのは2点だけ：
 *
 * 1. **試算例の金額は、例の世帯を算定エンジンに通した結果を出す**（`src/calc/topExample.ts`）。
 *    LP に数字を手で書くと、params が改定されたときに LP だけ古い金額を言い続ける。
 * 2. **「中心目安」は使わず幅で書く。** アプリは幅の両端で判定していて、中心値を出す画面が無い。
 *    LP だけが中心値を言うと、結果画面と食い違う。
 *
 * 書いてよいこと・いけないことは CLAUDE.md の「事業の芯」に従う。商品名も申込み導線も置かない。
 * スタイルは `lp.css`（全セレクタを `.okk-lp` の下に閉じ込めてある）。
 */
import type { CSSProperties } from "react";
import { Noto_Sans_JP, Shippori_Mincho } from "next/font/google";
import Link from "next/link";
import { topExample } from "../src/calc/topExample.js";
import { loadParams } from "../src/params/index.js";
import "./lp.css";

export const metadata = {
  title: "お金の健康診断｜必要な保障を、根拠から。",
  description:
    "お金の健康診断。約10問で、家族に必要なお金と、すでにある支え、いまの保障との差を根拠つきで見える化。保険を売らない診断です。",
};

/**
 * LP の書体（依頼どおり Noto Sans JP と Shippori Mincho を維持する）。
 * next/font がビルド時に取得して自前配信するので、実行時に Google へ取りに行かない。
 * 変数は `.okk-lp` にだけ付けるので、ほかの画面の書体は変わらない。
 */
const notoSans = Noto_Sans_JP({
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
  variable: "--lp-font-sans",
});
const shippori = Shippori_Mincho({
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
  variable: "--lp-font-serif",
});

/** 円 → 万円の数字（3桁区切り）。丸めは結果画面の表示（約○万円）と同じ */
const man = (yen: number) => Math.round(yen / 10_000).toLocaleString("ja-JP");

/** 棒の位置（総額に対する割合）。図の座標であって、金額ではない */
const plot = (bottom: number, height: number, total: number) =>
  ({
    "--bottom": total > 0 ? (bottom / total) * 100 : 0,
    "--height": total > 0 ? (height / total) * 100 : 0,
  }) as CSSProperties;

const GAP_LABEL = {
  shortage: "の不足",
  reducible: "上回っています",
} as const;

function Arrow() {
  return (
    <span className="cta-arrow" aria-hidden="true">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </svg>
    </span>
  );
}

export default function Home() {
  const ex = topExample(loadParams(), new Date());
  const needText = `${man(ex.need.low)}〜${man(ex.need.high)}`;
  const gapText =
    ex.gap && (ex.verdict === "shortage" || ex.verdict === "reducible")
      ? `${man(ex.gap.low)}〜${man(ex.gap.high)}万円${GAP_LABEL[ex.verdict]}`
      : "必要額の幅の中にあります";

  // 滝の段：総額から支えを順に引く。最後の棒は「保険で備える額」の幅（下端〜上端）
  const afterPension = ex.total - ex.pension;
  const afterWork = afterPension - ex.survivorWork;
  const afterAssets = afterWork - ex.assets;

  return (
    <div className={`okk-lp ${notoSans.variable} ${shippori.variable}`}>
      <a className="skip" href="#main">
        本文へ移動
      </a>
      <header className="masthead wrap">
        <a className="brand" href="#main" aria-label="お金の健康診断 トップ">
          <span className="brand-mark">
            <svg className="brand-icon" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M3 17h7l4-9 5 17 4-8h6" />
            </svg>
          </span>
          お金の健康診断
        </a>
        <div className="header-right">
          <span className="header-note">会社員のための、保障のものさし。</span>
          <a className="header-link" href="#example-title">
            診断で分かること
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 19 19 5M5 5h14v14" />
            </svg>
          </a>
        </div>
      </header>

      <main id="main">
        {/* 01 ヒーロー */}
        <section className="hero family-hero" aria-labelledby="hero-title">
          <div className="family-visual">
            {/* biome-ignore lint/performance/noImgElement: LP の写真は単体 HTML と同じ描画にそろえる */}
            <img
              alt="明るいリビングで幼い子どもを囲み、笑い合う親子3人のイメージ"
              className="family-photo"
              fetchPriority="high"
              height={1024}
              src="/lp/family-hero.jpg"
              width={1536}
            />
            <span className="family-caption">画像はイメージです</span>
          </div>
          <div className="hero-inner">
            <div className="hero-copyblock">
              <p className="hero-eyebrow">働く人のための、保険を売らない診断。</p>
              <h1 id="hero-title">
                その保障、
                <br />
                わが家に
                <br />
                <span>ちょうどいい？</span>
              </h1>
              <p className="hero-copy">
                必要な額も、いまの保障との差も。
                <br />
                約10問で、根拠から見えてきます。
              </p>
            </div>
          </div>

          <aside
            className="diagnosis-ticket"
            aria-label={`死亡保障の試算例。${ex.selfAge}歳会社員。保険で備えたい額は${needText}万円。いまの保障${man(ex.coverage)}万円との差は${gapText}。`}
          >
            <div className="ticket-head">
              <span className="ticket-title">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h5" />
                </svg>
                保障の現在地
              </span>
              <span className="ticket-sample">試算例</span>
            </div>
            <div className="ticket-main">
              <div>
                <p className="ticket-label">保険で備えたい額</p>
                <p className="ticket-amount ticket-amount-range">
                  <small>約</small>
                  {needText}
                  <span>万円</span>
                </p>
                <p className="ticket-range">答えの幅で計算・内訳と出典つき</p>
              </div>
            </div>
            <div className="ticket-compare">
              <div className="ticket-stats">
                <div>
                  <p>
                    <i />
                    いまの保障
                  </p>
                  <strong>
                    {man(ex.coverage)}
                    <small>万円</small>
                  </strong>
                </div>
                <div className="ticket-shortage">
                  <p>
                    <i />
                    いまの保障との差
                  </p>
                  <strong className="ticket-gap">{gapText}</strong>
                </div>
              </div>
            </div>
          </aside>
          <div className="hero-bottom">
            <span>「だいたいの範囲」も「分からない」も、答えになります。</span>
            <a className="hero-scroll" href="#empathy-title">
              詳しく見る
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4v15m-6-6 6 6 6-6" />
              </svg>
            </a>
          </div>
        </section>

        <section className="start-band wrap" aria-label="診断をはじめる">
          <div className="start-message">
            <p>まずは、自分の現在地を。</p>
            <span>約10問で、必要な保障の過不足を確認できます。</span>
          </div>
          <div className="start-action">
            <Link className="cta" href="/wizard">
              <span className="cta-label">10問で診断する</span>
              <Arrow />
            </Link>
          </div>
        </section>

        {/* 02 共感 */}
        <section className="empathy" aria-labelledby="empathy-title">
          <div className="wrap empathy-grid">
            <div>
              <p className="section-label">
                <span>02</span> 気になるのは、暮らしが変わるとき。
              </p>
              <h2 id="empathy-title">
                大切なものが増えた。
                <br />
                保障は、そのままでいい？
              </h2>
            </div>
            <div className="empathy-text">
              <div className="moments">
                <span className="moment">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M9 11h.01M15 11h.01m-6 5c2 2 4 2 6 0M12 5c0-4 4-3 4-1" />
                  </svg>
                  子どもが生まれた
                </span>
                <span className="moment">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m3 11 9-8 9 8M5 9v12h14V9m-10 12v-7h6v7" />
                  </svg>
                  家を買った
                </span>
              </div>
              <p>
                AIに聞いてみても、聞き方で金額が変わる。
                <br />
                その数字を、どう確かめればいいんだろう。
              </p>
              <p>でも、プランナーに相談するのは、少し重い。</p>
              <p className="empathy-bottom">まずは、自分の現在地を知ることから。</p>
            </div>
          </div>
        </section>

        {/* 03 分かること */}
        <section className="benefits wrap" aria-labelledby="benefits-title">
          <p className="section-label">
            <span>03</span> この診断で、分かること。
          </p>
          <div className="benefits-head">
            <h2 id="benefits-title">
              必要な保障は、
              <br />
              支えを知ると見えてくる。
            </h2>
            <p className="lead">
              万一の死亡、病気、失業。
              <br />
              家族の暮らしを、お金の面から確かめます。
            </p>
          </div>
          <div className="benefit-grid">
            <article className="benefit">
              <svg className="icon" viewBox="0 0 44 44" aria-hidden="true">
                <path d="M7 38V18L22 6l15 12v20H7m10 0V25h10v13" />
                <path d="M17 17h10" />
              </svg>
              <h3>家族に必要な総額</h3>
              <p>もしもの後、家族のこれからの暮らしに、どれだけ必要か。</p>
            </article>
            <article className="benefit">
              <svg className="icon" viewBox="0 0 44 44" aria-hidden="true">
                <path d="m5 16 17-9 17 9H5m4 5v12m9-12v12m8-12v12m9-12v12M5 38h34" />
              </svg>
              <h3>すでにある支え</h3>
              <p>遺族年金・団信・配偶者の収入・貯蓄で、どこまでまかなえるか。</p>
            </article>
            <article className="benefit">
              <svg className="icon" viewBox="0 0 44 44" aria-hidden="true">
                <path d="M8 38V8h28v30H8m7-21h14m-14 7h14m-14 7h5" />
                <circle cx="31" cy="31" r="8" />
                <path d="m28 31 2 2 4-5" />
              </svg>
              <h3>いまの保障との過不足</h3>
              <p>残りの「保険で備える額」と、いま入っている保障との差。</p>
            </article>
          </div>
          <p className="evidence">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h6" />
            </svg>
            計算の内訳、公的制度の出典、試算に使った前提まで確認できます。
          </p>
        </section>

        {/* 04 試算例。金額は src/calc/topExample.ts（例の世帯を diagnose に通した結果） */}
        <section className="example" aria-labelledby="example-title">
          <div className="wrap">
            <p className="section-label">
              <span>04</span> ある家族の、診断をのぞいてみる。
            </p>
            <div className="example-heading">
              <h2 id="example-title">
                約{man(ex.total)}万円、すべてを
                <br />
                保険で備えるわけではありません。
              </h2>
              <span className="example-tag">死亡保障の試算例</span>
            </div>
            <div className="household">
              <span>{ex.selfAge}歳・会社員</span>
              <span>配偶者は専業</span>
              <span>子ども{ex.childAges.map((a) => `${a}歳`).join("・")}</span>
              <span>持ち家・ローンあり・{ex.danshinCovered ? "団信あり" : "団信なし"}</span>
            </div>
            <figure
              className="chart"
              aria-label={`家族に必要な約${man(ex.total)}万円から、遺族年金約${man(ex.pension)}万円、配偶者の就労収入約${man(ex.survivorWork)}万円、貯蓄約${man(ex.assets)}万円を引くと、保険で備えたい額は約${needText}万円。`}
            >
              <figcaption className="chart-heading">
                <span>家族に必要なお金から、支えを引く。</span>
                <span className="legend">すでにある支え</span>
              </figcaption>
              <div className="waterfall" aria-hidden="true">
                <div className="column">
                  <div className="plot" style={plot(0, ex.total, ex.total)}>
                    <div className="amount">
                      {man(ex.total)}
                      <small>万円</small>
                    </div>
                    <div className="bar total" />
                  </div>
                  <div className="chart-label">
                    家族に必要な総額<small>約{man(ex.total)}万円</small>
                  </div>
                </div>
                <div className="column">
                  <div className="plot" style={plot(afterPension, ex.pension, ex.total)}>
                    <div className="amount">
                      −{man(ex.pension)}
                      <small>万円</small>
                    </div>
                    <div className="bar" />
                  </div>
                  <div className="chart-label">
                    遺族年金<small>公的制度の支え</small>
                  </div>
                </div>
                <div className="column">
                  <div className="plot" style={plot(afterWork, ex.survivorWork, ex.total)}>
                    <div className="amount">
                      −{man(ex.survivorWork)}
                      <small>万円</small>
                    </div>
                    <div className="bar" />
                  </div>
                  <div className="chart-label">
                    配偶者の就労収入<small>将来の収入を試算</small>
                  </div>
                </div>
                <div className="column">
                  <div className="plot" style={plot(afterAssets, ex.assets, ex.total)}>
                    <div className="amount">
                      −{man(ex.assets)}
                      <small>万円</small>
                    </div>
                    <div className="bar" />
                  </div>
                  <div className="chart-label">
                    貯蓄<small>手元にある備え</small>
                  </div>
                </div>
                <div className="column">
                  {/* 最後の棒は1本の高さではなく、幅（下端〜上端）を帯で描く */}
                  <div
                    className="plot"
                    style={plot(ex.need.low, ex.need.high - ex.need.low, ex.total)}
                  >
                    <div className="amount">
                      {needText}
                      <small>万円</small>
                    </div>
                    <div className="bar final" />
                  </div>
                  <div className="chart-label">
                    保険で備えたい額<small>答えの幅で計算</small>
                  </div>
                </div>
              </div>
              {ex.danshinCovered && (
                <div className="housing">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m3 10 9-7 9 7M5 9v12h14V9m-10 12v-7h6v7" />
                  </svg>
                  <strong>ローン分の住居費は0円</strong>
                  <span>団信でローンが完済される前提。総額には、返済分を含めていません。</span>
                </div>
              )}
            </figure>
            <div className="position">
              <div className="position-current">
                <span className="position-label">いまの死亡保障</span>
                <span className="position-num">
                  {man(ex.coverage)}
                  <small>万円</small>
                </span>
              </div>
              <div className="position-gap">
                <div>
                  <p className="gap-intro">いまの保障との差</p>
                </div>
                <p className="gap-number gap-number-range">{gapText}</p>
              </div>
            </div>
            <p className="example-note">
              試算例です。実際の金額は回答によって変わります。金額は、この世帯の回答を診断と同じ計算エンジンに通した結果です。
              <br />
              最後の棒は「保険で備えたい額」の幅（下端〜上端）を表しています。住居費0円は住宅ローン返済分を指し、維持費などがなくなる意味ではありません。
            </p>
          </div>
        </section>

        {/* 05 制度の更新 */}
        <section className="updates wrap" aria-labelledby="updates-title">
          <p className="section-label">
            <span>05</span> 制度の変化も、見守る。
          </p>
          <h2 id="updates-title">数字を、古いままにしないために。</h2>
          <p className="lead">
            AIが毎週、厚生労働省や日本年金機構の一次情報を確認。
            <br />
            変化があれば、人の確認を経て、診断の計算へ反映します。
          </p>
          <div className="flow">
            <article className="flow-step">
              <div className="step-kicker">
                <span>1</span> AI ／ 毎週
              </div>
              <h3>制度の変化を見張る</h3>
              <p>
                公的な一次情報を見に行き、
                <br />
                前回との違いを確かめる。
              </p>
            </article>
            <article className="flow-step">
              <div className="step-kicker">
                <span>2</span> 変更があったら
              </div>
              <h3>影響を計算して知らせる</h3>
              <p>
                診断への影響を計算し、
                <br />
                担当者に確認を依頼する。
              </p>
            </article>
            <article className="flow-step">
              <div className="step-kicker">
                <span>3</span> 担当者
              </div>
              <h3>人が確かめて反映</h3>
              <p>
                根拠と影響を確認してから、
                <br />
                計算に取り入れる。
              </p>
            </article>
          </div>
          <p className="human-note">
            診断の金額は、回答と計算に基づきます。AIが金額そのものを作ることはありません。
          </p>
        </section>

        {/* 06 締め */}
        <section className="closing" aria-labelledby="closing-title">
          <div className="wrap">
            <p className="section-label">
              <span>06</span> 売り手がいない。その意味。
            </p>
            <div className="closing-main">
              <div>
                <h2 id="closing-title">
                  本当に必要な人に、
                  <br />
                  <span className="accent">「必要です、準備してください」</span>
                  <br />
                  と、伝えられること。
                </h2>
                <p className="closing-reason">
                  売り手がいないから、その一言を信じてもらえる。
                  <br />
                  足りている人にも、足りない人にも、根拠つきで。
                </p>
              </div>
              <div className="closing-invite">
                <p>
                  わが家に合った備えを、
                  <br />
                  知ることから。
                </p>
                <span>
                  気になったとき、
                  <br />
                  相談する前の、最初の一歩に。
                </span>
              </div>
            </div>
            <section className="howto" aria-labelledby="howto-title">
              <div className="howto-head">
                <h3 id="howto-title">診断は、かんたん3ステップ。</h3>
                <p>用意するのは、だいたいの情報だけ。</p>
              </div>
              <ol className="howto-steps">
                <li>
                  <span className="howto-number" aria-hidden="true">
                    1
                  </span>
                  <h4>約10問に答える</h4>
                  <p>
                    年収や貯蓄は範囲から選択。
                    <br />
                    「分からない」でも進めます。
                  </p>
                </li>
                <li>
                  <span className="howto-number" aria-hidden="true">
                    2
                  </span>
                  <h4>必要な額と支えを見る</h4>
                  <p>
                    公的制度や貯蓄で、
                    <br />
                    どこまでまかなえるか確認。
                  </p>
                </li>
                <li>
                  <span className="howto-number" aria-hidden="true">
                    3
                  </span>
                  <h4>いまの保障と比べる</h4>
                  <p>
                    過不足だけでなく、
                    <br />
                    計算の内訳・出典まで見えます。
                  </p>
                </li>
              </ol>
            </section>
            <div className="closing-action">
              <p>あなたの現在地を、確かめてみませんか。</p>
              <Link className="cta" href="/wizard">
                <span className="cta-label">10問で診断する</span>
                <Arrow />
              </Link>
            </div>
            <footer className="footer">
              <span className="footer-brand">お金の健康診断</span>
              <p className="footer-note">
                現在は検証版です。診断の金額は概算で、確定した値ではありません。
              </p>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
