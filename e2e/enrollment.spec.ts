import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("button", { hasText: email }).click();
  await page.waitForURL(/\/dashboard/);
}

test("submitting an enrollment plan queues an intent for the appointment-time commit", async ({ page }) => {
  // Self-contained: creates its own Fall 2026 draft, adds a course, and marks
  // it as the enrollment plan, rather than assuming another spec file left
  // one behind — schedule-builder.spec.ts also drives Marcus's schedules and
  // would otherwise leave whichever one it ran last as "the" enrollment plan.
  await loginAs(page, "marcus.chen@uwo.ca");
  await page.goto("/plan");

  const scheduleName = `E2E Enrollment Plan ${Date.now()}`;
  await page.getByPlaceholder("New schedule name").fill(scheduleName);
  await page.getByRole("button", { name: "New" }).click();
  await expect(page.getByText(scheduleName).first()).toBeVisible();

  await page.getByPlaceholder("Search subject, number, or title").fill("DATASCI 1000");
  const card = page.locator("li", { hasText: "DATASCI 1000A/B" }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Add" }).first().click();
  await expect(card.getByRole("button", { name: "Added" }).first()).toBeVisible();

  const scheduleListItem = page.locator("li", { hasText: scheduleName });
  await scheduleListItem.getByRole("button", { name: "Mark as plan" }).click();
  await expect(scheduleListItem.getByText("Enrollment plan")).toBeVisible();

  await page.goto("/enrollment");
  const fallCard = page.locator("div", { hasText: "FALL 2026" }).first();
  await expect(fallCard.getByText(scheduleName)).toBeVisible();

  await fallCard.getByRole("button", { name: "Submit enrollment intent" }).click();
  await expect(fallCard.getByText(/Status:/)).toBeVisible({ timeout: 10000 });
  await expect(fallCard.getByText("Queued — waiting for your appointment")).toBeVisible();
  await expect(fallCard.getByRole("button", { name: "Re-submit enrollment intent" })).toBeVisible();
});
