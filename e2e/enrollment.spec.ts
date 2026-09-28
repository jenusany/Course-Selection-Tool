import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("button", { hasText: email }).click();
  await page.waitForURL(/\/dashboard/);
}

test("submitting an enrollment plan queues an intent for the appointment-time commit", async ({ page }) => {
  // Assumes a Fall 2026 schedule marked as Marcus's enrollment plan already
  // exists (seeded directly for this check — see Phase 4 verification notes).
  await loginAs(page, "marcus.chen@uwo.ca");
  await page.goto("/enrollment");

  const fallCard = page.locator("div", { hasText: "FALL 2026" }).first();
  await expect(fallCard.getByText("My Fall Plan")).toBeVisible();

  await fallCard.getByRole("button", { name: "Submit enrollment intent" }).click();
  await expect(fallCard.getByText(/Status:/)).toBeVisible({ timeout: 10000 });
  await expect(fallCard.getByText("Queued — waiting for your appointment")).toBeVisible();
  await expect(fallCard.getByRole("button", { name: "Re-submit enrollment intent" })).toBeVisible();
});
