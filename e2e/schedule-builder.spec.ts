import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("button", { hasText: email }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe("Phase 3: course selection + schedule builder", () => {
  test("search finds a course and shows why it can't be added (antirequisite conflict)", async ({ page }) => {
    // Derek Osei's fixture: completed COMPSCI 3380F/G/Z, which is an
    // antirequisite of COMPSCI 4490Z (Thesis) — see packages/db/prisma/seed/students.ts.
    await loginAs(page, "derek.osei@uwo.ca");
    await page.goto("/plan");

    await page.getByPlaceholder("Search subject, number, or title").fill("4490Z");
    const card = page.locator("li", { hasText: "COMPSCI 4490Z" }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText("Can't add")).toBeVisible();

    const addButton = card.getByRole("button", { name: "Add" }).first();
    await expect(addButton).toBeDisabled();
  });

  test("create a draft schedule, add a course, and mark it as the enrollment plan", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/plan");

    const scheduleName = `E2E Plan ${Date.now()}`;
    await page.getByPlaceholder("New schedule name").fill(scheduleName);
    await page.getByRole("button", { name: "New" }).click();
    await expect(page.getByText(scheduleName).first()).toBeVisible();

    await page.getByPlaceholder("Search subject, number, or title").fill("DATASCI 1000");
    const card = page.locator("li", { hasText: "DATASCI 1000A/B" }).first();
    await expect(card).toBeVisible();

    const addButton = card.getByRole("button", { name: "Add" }).first();
    await expect(addButton).toBeEnabled();
    await addButton.click();
    await expect(card.getByRole("button", { name: "Added" }).first()).toBeVisible();

    // The active schedule's item list (right rail) should now show the course.
    const scheduleCard = page.getByTestId("active-schedule-panel");
    await expect(scheduleCard.getByText(scheduleName)).toBeVisible();
    await expect(scheduleCard.getByText("DATASCI 1000A/B")).toBeVisible();

    const scheduleListItem = page.locator("li", { hasText: scheduleName });
    await scheduleListItem.getByRole("button", { name: "Mark as plan" }).click();
    await expect(scheduleListItem.getByText("Enrollment plan")).toBeVisible();
  });
});
