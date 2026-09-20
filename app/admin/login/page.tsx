/**
 * 承認画面のログイン。合言葉1つだけ。
 *
 * **失敗の理由を書き分けない。**「違う」と「サーバが未設定」を分けると、
 * 外から設定状況が読める。
 */
import s from "./page.module.css";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;

  return (
    <main className={s.page}>
      <h1 className={s.title}>運営用の画面</h1>
      <p className={s.body}>制度パラメータの変更提案を確認する画面です。合言葉が要ります。</p>
      {e ? (
        <p className={s.error} role="alert">
          入れませんでした。合言葉を確認してください。
        </p>
      ) : null}
      <form action="/api/admin/login" method="post">
        <label className={s.label} htmlFor="password">
          合言葉
        </label>
        <input
          autoComplete="current-password"
          className={s.input}
          id="password"
          name="password"
          required
          type="password"
        />
        <button className={s.button} type="submit">
          入る
        </button>
      </form>
    </main>
  );
}
