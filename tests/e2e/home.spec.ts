import { expect, test } from "@playwright/test";

test("home page explains the initial demo flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("デモ環境")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Excelから請求候補までを一周できます" })).toBeVisible();
  await expect(page.getByRole("link", { name: "① Excel取込を始める" })).toHaveAttribute("href", "/import");
  await expect(page.getByRole("link", { name: "② 現場入力を試す" })).toHaveAttribute("href", "/field");
  await expect(page.getByRole("link", { name: "③ 請求候補を見る" })).toHaveAttribute("href", "/billing");
  await expect(page.getByText("本番接続について", { exact: true })).toHaveCount(0);
  await expect(page.getByText("今回の初期版で見せる範囲", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "稼働確認", exact: true })).toHaveCount(0);
});
