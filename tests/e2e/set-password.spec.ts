import { expect, test } from "@playwright/test";

test("招待された利用者向けのパスワード設定画面を表示できる", async ({ page }) => {
  await page.goto("/set-password");

  await expect(page.getByRole("heading", { name: "パスワードを設定" })).toBeVisible();
  await expect(page.getByLabel("パスワード", { exact: true })).toBeVisible();
  await expect(page.getByLabel("確認用パスワード", { exact: true })).toBeVisible();
});
