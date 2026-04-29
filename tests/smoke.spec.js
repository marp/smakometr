// @ts-check
const { test, expect } = require("@playwright/test");

test("pyszne.pl menu page loads", async ({ page }) => {
  await page.goto("https://www.pyszne.pl/na-dowoz/jedzenie/00-100");
  // await expect(page).toHaveTitle(/pyszne/i);
});


