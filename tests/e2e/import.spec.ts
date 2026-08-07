import path from "node:path";
import { expect, test } from "@playwright/test";

test("office user can preview the real July 1 workbook", async ({ page }) => {
  await page.goto("/import");
  await page.getByLabel("Excelファイル（.xlsx）").setInputFiles(path.join(process.cwd(), "7月1日リベティ.xlsx"));
  await page.getByRole("button", { name: "内容を確認する" }).click();
  await expect(page.getByText("Excelを確認しました。まだ登録はしていません。")).toBeVisible();
  await expect(page.getByText("出荷件数")).toBeVisible();
  await expect(page.getByText("DR01010018697")).toBeVisible();
  await expect(page.getByRole("cell", { name: "マットブラック S × 1、モバイルバッテリー × 1" }).first()).toBeVisible();
});
