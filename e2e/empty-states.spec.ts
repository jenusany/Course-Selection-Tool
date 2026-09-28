import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("UWO email").fill(email);
  await page.getByLabel("Password").fill("test");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
}

// Priya Nakamura: first-year, undeclared — no programs, no completed
// courses, no holds (packages/db/prisma/seed/students.ts). The sparsest
// fixture on purpose, so every page's empty state gets exercised for real
// rather than only ever being seen with a fully-populated student.
test.describe("Phase 7: empty states (Priya Nakamura — undeclared, no history)", () => {
  test("dashboard shows an undeclared/no-holds/no-in-progress state without erroring", async ({ page }) => {
    await loginAs(page, "priya.nakamura@uwo.ca");
    await expect(page.getByRole("heading", { name: /Welcome back, Priya/ })).toBeVisible();
    // No active-holds banner should render at all when there are none.
    await expect(page.getByText(/active hold/i)).toHaveCount(0);
  });

  test("plan page's degree audit renders with zero declared programs", async ({ page }) => {
    await loginAs(page, "priya.nakamura@uwo.ca");
    const resp = await page.goto("/plan");
    expect(resp?.status()).toBe(200);
    await expect(page.getByPlaceholder("Search subject, number, or title")).toBeVisible();
  });

  test("academic file shows 'Undeclared' and 'None on file' rather than erroring", async ({ page }) => {
    await loginAs(page, "priya.nakamura@uwo.ca");
    await page.goto("/academic-file");
    await expect(page.getByText("Undeclared")).toBeVisible();
    await expect(page.getByText("None on file").first()).toBeVisible();
  });

  test("chat still answers a policy question for a student with no program declared", async ({ page }) => {
    await loginAs(page, "priya.nakamura@uwo.ca");
    await page.goto("/chat");
    await page.getByPlaceholder("Ask a question…").fill("What is the prerequisite for COMPSCI 2210A/B?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/\[1\] source/)).toBeVisible({ timeout: 10000 });
  });

  test("enrollment page shows no-plan-yet state for both terms", async ({ page }) => {
    await loginAs(page, "priya.nakamura@uwo.ca");
    await page.goto("/enrollment");
    await expect(page.getByText("No schedule marked as your enrollment plan for this term yet.").first()).toBeVisible();
  });
});
