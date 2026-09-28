import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("button", { hasText: email }).click();
  await page.waitForURL(/\/dashboard|\/counsellor/);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

test("counsellor can view an assigned student's file and add an advising note, logged and visible to the student", async ({ page }) => {
  await loginAs(page, "r.stevens@uwo.ca");
  await page.waitForURL(/\/counsellor$/);
  await expect(page.getByRole("heading", { name: "Your caseload" })).toBeVisible();

  await page.getByText("Marcus Chen").click();
  await page.waitForURL(/\/counsellor\/.+/);
  await expect(page.getByRole("heading", { name: "Marcus Chen" })).toBeVisible();

  const uniqueTopic = `E2E test note ${Date.now()}`;
  await page.getByRole("tab", { name: "Advising notes" }).click();
  await page.getByPlaceholder("Topic").fill(uniqueTopic);
  await page.getByPlaceholder("Summary").fill("Added by the Phase 5 Playwright check.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText(uniqueTopic)).toBeVisible();

  await logout(page);

  await loginAs(page, "marcus.chen@uwo.ca");
  await page.goto("/academic-file");
  await expect(page.getByText(uniqueTopic)).toBeVisible();
  await expect(page.getByText(/Rebecca Stevens \(counsellor\).*edit advising-note/).first()).toBeVisible();
  await expect(page.getByText(/Rebecca Stevens \(counsellor\).*view academic-file/).first()).toBeVisible();
});

test("counsellor cannot view a student outside their caseload", async ({ page }) => {
  await loginAs(page, "t.abara@uwo.ca");
  await page.waitForURL(/\/counsellor$/);
  await page.getByText("Sofia Marchetti").click();
  await page.waitForURL(/\/counsellor\/.+/);
  const sofiaUrl = page.url();
  await logout(page);

  await loginAs(page, "r.stevens@uwo.ca");
  const response = await page.goto(sofiaUrl);
  expect(response?.status()).toBe(404);
});
