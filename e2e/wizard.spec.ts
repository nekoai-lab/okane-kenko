import { expect, type Page, test } from "@playwright/test";

/**
 * モバイル幅でウィザードが崩れず、結果まで到達することを確認する。
 * 「崩れ」= 横スクロールが出る（body が視野幅を超える）ことを主判定にする。
 */

async function expectNoHorizontalOverflow(page: Page, where: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // 1px の丸め誤差は許容
  expect(scrollWidth, `横スクロールが出ている（${where}）`).toBeLessThanOrEqual(clientWidth + 1);
}

test("最短経路：独身・子なし・賃貸・保険分からない → pending まで到達し崩れない", async ({
  page,
}) => {
  await page.goto("/wizard");

  // S1 あなたのこと
  await expect(page.getByText("あなたのこと")).toBeVisible();
  await expectNoHorizontalOverflow(page, "S1");
  await page.getByRole("combobox").selectOption("1990");
  await page.getByRole("radio", { name: "会社員" }).check();
  await page.getByRole("button", { name: "次へ" }).click();

  // S2 ご家族のこと（配偶者なし・子0人）
  await page.getByRole("radio", { name: "いない" }).check();
  await page.getByRole("combobox").selectOption("0"); // 子の人数
  await expectNoHorizontalOverflow(page, "S2");
  await page.getByRole("button", { name: "次へ" }).click();

  // S3 収入のこと
  await page.getByRole("radio", { name: "400万円以下" }).check();
  await page.getByRole("button", { name: "次へ" }).click();

  // S4 資産と暮らし
  await page.getByRole("radio", { name: "100万円以下" }).check();
  await page.getByRole("radio", { name: "20万円以下" }).check();
  await expectNoHorizontalOverflow(page, "S4");
  await page.getByRole("button", { name: "次へ" }).click();

  // S5 住まいのこと（賃貸）
  await page.getByRole("radio", { name: "賃貸" }).check();
  await page.getByRole("button", { name: "次へ" }).click();

  // S6 保険のこと（分からない）
  await expect(page.getByText("保険のこと")).toBeVisible();
  await page.getByRole("radio", { name: "分からない" }).check();
  await expectNoHorizontalOverflow(page, "S6");
  await page.getByRole("button", { name: "結果を見る" }).click();

  // 結果ページ：pending を中立に表示、崩れない
  await expect(page).toHaveURL(/\/result/);
  await expect(page.getByText("過不足はまだ出していません").first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "result(pending)");
  await page.screenshot({ path: "test-results/result-pending.png", fullPage: true });
});

test("重い経路：配偶者あり・持ち家ローンあり・保障額あり → 結論まで到達し崩れない", async ({
  page,
}) => {
  const groupRadio = (legend: string, name: string) =>
    page.getByRole("group", { name: legend }).getByRole("radio", { name, exact: true });

  await page.goto("/wizard");

  // S1
  await page.getByRole("combobox").selectOption("1985");
  await page.getByRole("radio", { name: "会社員" }).check();
  await page.getByRole("button", { name: "次へ" }).click();

  // S2 配偶者あり・子1人（進路設問まで出す）
  await page.getByRole("radio", { name: "いる" }).check();
  await page
    .getByRole("group", { name: "配偶者の生まれた年" })
    .getByRole("combobox")
    .selectOption("1987");
  await groupRadio("配偶者の働き方", "専業主婦・主夫／無職").check();
  await page.getByRole("combobox", { name: "人数" }).selectOption("1");
  await page.getByRole("combobox", { name: "お子さん1の生年" }).selectOption("2016");
  await groupRadio("お子さんの進路の見通し", "まだ決めていない").check();
  await expectNoHorizontalOverflow(page, "S2(配偶者・子あり・進路)");
  await page.getByRole("button", { name: "次へ" }).click();

  // S3
  await groupRadio("あなたの年収（税込み）", "600〜800万円").check();
  await groupRadio("配偶者の年収（税込み）", "収入なし").check();
  await page.getByRole("button", { name: "次へ" }).click();

  // S4
  await groupRadio("世帯の金融資産（貯金・投資などの合計）", "300〜500万円").check();
  await groupRadio("毎月の生活費", "25〜30万円").check();
  await page.getByRole("button", { name: "次へ" }).click();

  // S5 持ち家ローンあり → ローン残高＋団信の2グループ（最も横幅が要る段）
  await page.getByRole("radio", { name: "持ち家（住宅ローンあり）" }).check();
  await groupRadio("住宅ローンの残高", "2000〜3000万円").check();
  await groupRadio("団信（だんしん）に入っていますか？", "入っている").check();
  await expectNoHorizontalOverflow(page, "S5(持ち家ローンあり)");
  await page.getByRole("button", { name: "次へ" }).click();

  // S6 保障額（本人・配偶者）
  await groupRadio("あなたが亡くなったときに受け取れる死亡保険金（合計）", "1000万円").check();
  await groupRadio("配偶者が亡くなったときに受け取れる死亡保険金（合計）", "加入していない").check();
  await expectNoHorizontalOverflow(page, "S6(配偶者あり)");
  await page.getByRole("button", { name: "結果を見る" }).click();

  // 結果：pending ではなく過不足の結論が出る
  await expect(page).toHaveURL(/\/result/);
  await expect(page.getByText("過不足はまだ出していません")).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "result(結論)");
  await page.screenshot({ path: "test-results/result-verdict.png", fullPage: true });

  // 当社基準スライダー：生活費を上げると必要額（あなた）がライブ再計算される
  const slider = page.getByRole("slider");
  await expect(slider).toBeVisible();
  const resultText = page.getByText("必要な保障額（あなた）：");
  const before = await resultText.textContent();
  await slider.fill("45"); // 生活費を上限(45万)へ
  await expect(async () => {
    expect(await resultText.textContent()).not.toBe(before);
  }).toPass({ timeout: 5000 });
  await expectNoHorizontalOverflow(page, "result(slider)");
});

test("再開：URL に状態を載せて開き直すと復元される", async ({ page }) => {
  // 途中まで進んだ状態の URL を直接開く
  await page.goto("/wizard?v=1&sb=1988&emp=self&sp=0");
  // 3ステップ目まで手で進めなくても、S1 の選択が復元されているか（就業=自営が checked）
  await expect(page.getByRole("radio", { name: "自営・フリーランス" })).toBeChecked();
  await expectNoHorizontalOverflow(page, "resume");
});
