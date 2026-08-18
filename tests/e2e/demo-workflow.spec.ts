import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";

test("実Excelを取込登録し、現場入力から請求確認まで完了できる", async ({ page }) => {
  const originalWorkbookPath = path.join(process.cwd(), "7月1日リベティ.xlsx");
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "cslogi-demo-workflow-"));
  const workbookPath = path.join(temporaryDirectory, "demo-workflow.xlsx");
  // 既に入力済みのローカルデモがあっても、先頭500件に必ず入る一意な番号にする。
  const runId = `0E2E${String(10_000_000_000_000 - Date.now()).padStart(13, "0")}`;
  const shipmentNo = `${runId}-DR01010018697`;

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(originalWorkbookPath);
    const worksheet = workbook.getWorksheet("出荷指示貼り付け");
    if (!worksheet) throw new Error("出荷指示貼り付けシートが見つかりません");
    let shipmentNoColumn = 0;
    worksheet.getRow(1).eachCell((cell, columnNumber) => {
      if (cell.text.trim() === "出荷指示NO") shipmentNoColumn = columnNumber;
    });
    if (shipmentNoColumn < 1) throw new Error("出荷指示NO列が見つかりません");
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 1) {
        const cell = row.getCell(shipmentNoColumn);
        if (String(cell.text || cell.value || "").trim()) cell.value = `${runId}-${String(cell.text || cell.value).trim()}`;
      }
    });
    await workbook.xlsx.writeFile(workbookPath);

    await page.goto("/import");
    await page.getByLabel("Excelファイル（.xlsx）").setInputFiles(workbookPath);
    await page.getByRole("button", { name: "内容を確認する" }).click();
    await expect(page.getByText("Excelを確認しました。まだ登録はしていません。")).toBeVisible();
    await expect(page.getByText(shipmentNo)).toBeVisible();

    await page.getByRole("button", { name: "この内容で登録する" }).click();
    await expect(page.getByText("Excelを登録しました。次は現場入力と単価計算に進めます。")).toBeVisible();
    await page.goto("/shipments");
    await expect(page.getByRole("heading", { name: "登録済み出荷" })).toBeVisible();
    await expect(page.getByRole("cell", { name: shipmentNo })).toBeVisible();
    await page.goto("/field");
    await expect(page).toHaveURL(/\/field$/);

    const shipmentSelect = page.getByLabel("登録済みの出荷から選ぶ");
    const shipmentOption = shipmentSelect.locator("option").filter({ hasText: shipmentNo }).first();
    await expect(shipmentOption).toBeAttached();
    await shipmentSelect.selectOption(await shipmentOption.getAttribute("value") as string);
    await page.getByRole("button", { name: "入力例を入れる" }).click();
    await expect(page.getByLabel("出荷番号")).toHaveValue(shipmentNo);
    await page.getByRole("button", { name: "入力を保存" }).click();
    await expect(page.getByText("デモモードで保存しました")).toBeVisible();

    await page.goto("/billing");
    const recordSelect = page.getByLabel("請求候補の対象");
    const recordOption = recordSelect.locator("option").filter({ hasText: shipmentNo }).first();
    await expect(recordOption).toBeAttached();
    await recordSelect.selectOption(await recordOption.getAttribute("value") as string);
    await page.getByRole("button", { name: "請求候補を計算" }).click();
    await expect(page.getByText("請求候補を計算しました")).toBeVisible();
    await page.getByLabel("確認メモ（警告がある場合は必須）").fill("実Excelの取込から作業記録・単価を確認しました");
    await page.getByRole("button", { name: "確認済みにする" }).click();
    await expect(page.getByText("請求候補を確認済みにしました")).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
