import { expect, test } from "@playwright/test";

test("案1の主要画面はスマートフォン幅で横にはみ出さない", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  for (const path of ["/", "/import", "/field", "/billing"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(overflow.scrollWidth, `${path} が横にはみ出しています`).toBeLessThanOrEqual(overflow.clientWidth + 1);
  }
});
