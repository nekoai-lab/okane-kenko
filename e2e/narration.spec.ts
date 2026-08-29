/**
 * やさしい説明のストリーミング表示（T-07）を実ブラウザで見る。
 *
 * **実LLMは呼ばない**（`/api/narrate` を差し替える）。ここで確かめたいのは
 * 「AIはプレースホルダだけを書き、金額は画面側が算定結果から差し込む」という枠が
 * 実際の画面で成り立っていること。生成の中身の良し悪しは別（`npm run bakeoff` と盲検採点）。
 */
import { expect, test } from "@playwright/test";

/** 結論が rebalanceable になる世帯（夫婦・子1人・持ち家ローンあり） */
const QUERY =
  "v=1&sb=1988&emp=employee&sp=1&spb=1990&spe=employee&ch=2018&edu=public&inc=lt600&sinc=lt400&as=lt300&liv=lt25&ho=own_loan&loan=lt2000&dan=yes&cvs=m1000&cvsp=none";

function ndjson(events: object[]): string {
  return `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
}

test("AIの文はプレースホルダのまま届き、数値は画面側が差し込む", async ({ page }) => {
  await page.route("**/api/narrate*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      // プレースホルダが差分の途中で切れるケースを含める（壊れた形を出さないこと）
      body: ndjson([
        { type: "chunk", text: "いまの前提では、{{concl" },
        { type: "chunk", text: "usion}}。目安は {{selfRange}} です。" },
        { type: "done" },
      ]),
    });
  });

  await page.goto(`/result?${QUERY}`);
  const narration = page.getByTestId("narration");
  await expect(narration).toContainText("世帯全体で見直せそうです"); // {{conclusion}} が差し込まれた
  await expect(narration).toContainText("万円"); // 金額は算定結果から入る
  await expect(narration).not.toContainText("{{"); // 壊れた記号を残さない
});

test("検査に落ちたら定型文に切り替え、切り替えたことを画面に書く", async ({ page }) => {
  await page.route("**/api/narrate*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson([
        { type: "chunk", text: "いまの前提では、" },
        {
          type: "fallback",
          text: "いまの前提では、必要な保障の目安は 約200万円 です。世帯全体で見直せそうです。",
          reason: "g1_raw_number",
        },
      ]),
    });
  });

  await page.goto(`/result?${QUERY}`);
  await expect(page.getByTestId("narration")).toContainText("必要な保障の目安は");
  await expect(page.getByText("定型文に切り替えました")).toBeVisible();
});
