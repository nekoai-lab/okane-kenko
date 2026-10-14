import { expect, test } from "@playwright/test";

/**
 * トップページ（LP）：試算例は幅で出し、「中心目安」を言わない。診断への入口が /wizard に通じる。
 * 金額そのものの正しさは src/calc/topExample.test.ts が持つ（ここでは形だけ見る）。
 */
test("トップの試算例は幅で出し、入口から診断へ進める", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ちょうどいい");
  await expect(page.getByText("中心目安")).toHaveCount(0);
  await expect(page.getByText(/[\d,]+〜[\d,]+万円の不足|上回っています|幅の中にあります/).first()).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "横スクロールが出ている（/）").toBeLessThanOrEqual(clientWidth + 1);

  await page.getByRole("link", { name: /10問で診断する/ }).first().click();
  await expect(page).toHaveURL(/\/wizard/);
});
