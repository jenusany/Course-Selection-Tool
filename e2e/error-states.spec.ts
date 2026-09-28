import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("button", { hasText: email }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe("Phase 7: API error states", () => {
  // middleware.ts gates every route except /api/auth and /login — an unauthenticated
  // request never reaches the route handler at all, it's redirected to /login first.
  // Confirmed by NOT following the redirect, rather than assuming a bare 401.
  test("POST /api/chat without a session is redirected to /login, never reaching the handler", async ({ request }) => {
    const res = await request.post("/api/chat", { data: { question: "Hi" }, maxRedirects: 0 });
    expect([302, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/login");
  });

  test("GET /api/enrollment/status without a session is redirected to /login, never reaching the handler", async ({ request }) => {
    const res = await request.get("/api/enrollment/status?term=FALL&year=2026", { maxRedirects: 0 });
    expect([302, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/login");
  });

  test("POST /api/chat with an empty question is rejected with a clear error", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    const res = await page.request.post("/api/chat", { data: { question: "   " } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/question is required/i);
  });

  test("chat UI surfaces a failed request instead of silently doing nothing", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/chat");
    // Force the client fetch to fail so the widget's own error path is exercised for real.
    await page.route("**/api/chat", (route) => route.abort());
    await page.getByPlaceholder("Ask a question…").fill("What is the prerequisite for COMPSCI 2210A/B?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/something went wrong|failed/i)).toBeVisible();
  });

  test("schedule-planner surfaces a server-side rejection via the alert banner", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/plan");
    // Force the create-schedule server action's underlying fetch to fail.
    await page.route("**/plan", (route, req) => (req.method() === "POST" ? route.abort() : route.continue()));
    await page.getByPlaceholder("New schedule name").fill("Will fail");
    await page.getByRole("button", { name: "New" }).click();
    await expect(page.getByText("Failed to fetch")).toBeVisible({ timeout: 10000 });
  });
});
