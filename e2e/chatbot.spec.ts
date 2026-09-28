import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("button", { hasText: email }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe("Phase 6: advisor chatbot", () => {
  test("answers a policy question with a citation", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/chat");

    await page.getByPlaceholder("Ask a question…").fill("What is the prerequisite for COMPSCI 2210A/B?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(/\[1\] source/)).toBeVisible({ timeout: 10000 });
  });

  test("invokes the degree audit for a personal-progress question", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/chat");

    await page.getByPlaceholder("Ask a question…").fill("Am I on track to finish my Computer Science module?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(/Degree:/)).toBeVisible({ timeout: 10000 });
  });

  test("redirects an out-of-scope question to a real counsellor", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/chat");

    await page.getByPlaceholder("Ask a question…").fill("Can I petition for an antirequisite exception?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(/academic counsellor/i)).toBeVisible({ timeout: 10000 });
  });
});
