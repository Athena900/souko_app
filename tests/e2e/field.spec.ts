import { expect, test } from "@playwright/test";

test("field user can calculate and save a record in demo mode", async ({ page }) => {
  await page.goto("/field");
  await expect(page.getByLabel("登録済みの出荷から選ぶ")).toBeVisible();
  await page.getByLabel("出荷番号").fill(`SHP-E2E-${Date.now()}`);
  await page.getByLabel("箱数").fill("2");
  await page.getByLabel("緩衝材の個数").fill("3");
  await page.getByLabel("追加梱包の件数").fill("1");
  await page.getByRole("button", { name: "請求候補を計算" }).click();
  await expect(page.getByText("1,166円")).toBeVisible();
  await page.getByRole("button", { name: "入力を保存" }).click();
  await expect(page.getByText("デモモードで保存しました")).toBeVisible();
});

test("field user can load the demo input example", async ({ page }) => {
  await page.goto("/field");
  await page.getByRole("button", { name: "入力例を入れる" }).click();
  await expect(page.getByLabel("出荷番号")).toHaveValue("DEMO-001");
  await expect(page.getByLabel("箱数")).toHaveValue("2");
  await expect(page.getByLabel("緩衝材の個数")).toHaveValue("3");
  await page.getByRole("button", { name: "請求候補を計算" }).click();
  await expect(page.getByText("1,166円")).toBeVisible();
});
