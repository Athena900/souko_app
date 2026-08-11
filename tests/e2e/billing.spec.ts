import { expect, test } from "@playwright/test";

test("office user can calculate and approve a billing candidate in demo mode", async ({ page }) => {
  const shipmentNo = `SHP-BILLING-${Date.now()}`;
  await page.goto("/field");
  await page.getByLabel("出荷番号").fill(shipmentNo);
  await page.getByLabel("箱数").fill("2");
  await page.getByLabel("緩衝材の個数").fill("3");
  await page.getByLabel("追加梱包の件数").fill("1");
  const workDate = await page.getByLabel("作業日").inputValue();
  await page.getByRole("button", { name: "入力を保存" }).click();
  await expect(page.getByText("デモモードで保存しました")).toBeVisible();

  await page.goto("/billing");
  const recordSelect = page.getByLabel("請求候補の対象");
  await expect(recordSelect).toBeVisible();
  const recordOption = recordSelect.locator("option").filter({ hasText: shipmentNo }).first();
  await expect(recordOption).toBeAttached();
  await recordSelect.selectOption(await recordOption.getAttribute("value") as string);
  await page.getByRole("button", { name: "請求候補を計算" }).click();
  await expect(page.getByText("1,166円")).toBeVisible();
  await page.getByLabel("確認メモ（警告がある場合は必須）").fill("作業内容と単価を確認しました");
  await page.getByRole("button", { name: "確認済みにする" }).click();
  await expect(page.getByText("請求候補を確認済みにしました")).toBeVisible();
  await expect(page.getByText("確認済み", { exact: true })).toBeVisible();
  await expect(page.getByText(`選択中：${shipmentNo} / ${workDate}`, { exact: true })).toBeVisible();
});
