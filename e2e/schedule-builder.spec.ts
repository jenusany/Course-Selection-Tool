import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("UWO email").fill(email);
  await page.getByLabel("Password").fill("test");
  await page.getByRole("button", { name: "Sign in" }).click();
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

    const addButton = card.getByRole("button", { name: "Add", exact: true }).first();
    await expect(addButton).toBeDisabled();
  });

  test("hovering or focusing the Warning/Can't add label shows the specific reason", async ({ page }) => {
    await loginAs(page, "derek.osei@uwo.ca");
    await page.goto("/plan");

    await page.getByPlaceholder("Search subject, number, or title").fill("4490Z");
    const card = page.locator("li", { hasText: "COMPSCI 4490Z" }).first();
    const reasonButton = card.getByRole("button", { name: "Blocking reason" }).first();
    await expect(reasonButton).toBeVisible();

    // No tooltip until hovered/focused.
    await expect(page.getByText(/antirequisites of each other/)).not.toBeVisible();

    await reasonButton.hover();
    await expect(page.getByText(/antirequisites of each other/)).toBeVisible();

    // Also reachable by keyboard, not just mouse hover.
    await page.mouse.move(0, 0);
    await reasonButton.focus();
    await expect(page.getByText(/antirequisites of each other/)).toBeVisible();
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

    const addButton = card.getByRole("button", { name: "Add", exact: true }).first();
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

  test("addable courses sort ahead of blocked/already-completed ones", async ({ page }) => {
    // Jenusan Yogarajah: 4th-year, 25 completed courses — searching the
    // whole catalog surfaces a lot of "already completed"/blocked sections,
    // so addable courses sorting first is what makes the list useful.
    await loginAs(page, "jyogara@uwo.ca");
    await page.goto("/plan");

    const scheduleName = `Sort Check ${Date.now()}`;
    await page.getByPlaceholder("New schedule name").fill(scheduleName);
    await page.getByRole("button", { name: "New" }).click();
    // Wait for the strongest available signal that activeSchedule is actually
    // set client-side (not just that the name appeared in the list) — this
    // panel only renders when activeSchedule is truthy, which is exactly
    // what the addable-sort itself gates on. Flaked once under parallel
    // worker load relying on the schedule-name text alone.
    await expect(page.getByTestId("active-schedule-panel")).toBeVisible();
    await expect(page.getByTestId("active-schedule-panel").getByText("No courses added yet.")).toBeVisible();

    const cards = page.locator('ul > li:has-text("credit")');
    const count = await cards.count();
    expect(count).toBeGreaterThan(10);

    await expect
      .poll(
        async () => {
          for (let i = 0; i < count; i++) {
            const buttons = cards.nth(i).locator('button:text-is("Add")');
            const n = await buttons.count();
            for (let j = 0; j < n; j++) {
              if (await buttons.nth(j).isEnabled()) return true;
            }
          }
          return false;
        },
        { timeout: 10000 },
      )
      .toBe(true);

    const addableFlags: boolean[] = [];
    for (let i = 0; i < count; i++) {
      const buttons = cards.nth(i).locator('button:text-is("Add")');
      const n = await buttons.count();
      let addable = false;
      for (let j = 0; j < n; j++) {
        if (await buttons.nth(j).isEnabled()) addable = true;
      }
      addableFlags.push(addable);
    }

    const firstBlockedIndex = addableFlags.indexOf(false);
    expect(firstBlockedIndex).toBeGreaterThan(0); // some addable courses exist
    expect(addableFlags.slice(firstBlockedIndex)).not.toContain(true); // none addable after the first blocked one
  });
});
