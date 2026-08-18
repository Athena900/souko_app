import { expect, test } from "@playwright/test";

test("home page has no fixed dummy shipment data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("デモ環境")).toBeVisible();
  await expect(page.getByRole("heading", { name: "登録済みの出荷はありません" })).toBeVisible();
  await expect(page.getByTestId("dashboard-kpi-teal")).toContainText("0");
  await expect(page.getByText("まだ出荷データはありません。", { exact: true })).toBeVisible();
  await expect(page.getByText("128", { exact: true })).toHaveCount(0);
  await expect(page.getByText("株式会社ABC商事", { exact: true })).toHaveCount(0);
  await expect(page.getByText("出荷データにエラーがあります", { exact: true })).toHaveCount(0);
  await expect(page.getByText("本番接続について", { exact: true })).toHaveCount(0);
  await expect(page.getByText("今回の初期版で見せる範囲", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "稼働確認", exact: true })).toHaveCount(0);
});
