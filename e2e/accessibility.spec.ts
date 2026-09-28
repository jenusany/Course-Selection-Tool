import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("UWO email").fill(email);
  await page.getByLabel("Password").fill("test");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard|\/counsellor/);
}

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  if (results.violations.length > 0) {
    const details = results.violations
      .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)
      .join("\n\n");
    throw new Error(`Accessibility violations on ${page.url()}:\n\n${details}`);
  }
  expect(results.violations).toEqual([]);
}

test.describe("Phase 7: WCAG 2.1 AA scan (axe-core)", () => {
  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expectNoViolations(page);
  });

  test("student dashboard", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await expectNoViolations(page);
  });

  test("course search + schedule builder", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/plan");
    await expectNoViolations(page);
  });

  test("enrollment page", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/enrollment");
    await expectNoViolations(page);
  });

  test("student academic file", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/academic-file");
    await expectNoViolations(page);
  });

  test("advisor chat", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/chat");
    await expectNoViolations(page);
  });

  test("counsellor caseload roster", async ({ page }) => {
    await loginAs(page, "r.stevens@uwo.ca");
    await expectNoViolations(page);
  });

  test("counsellor student detail (one-pager with tabs)", async ({ page }) => {
    await loginAs(page, "r.stevens@uwo.ca");
    await page.getByText("Marcus Chen").click();
    await page.waitForURL(/\/counsellor\/.+/);
    await expectNoViolations(page);
  });
});

test.describe("Phase 7: keyboard operability", () => {
  test("the term toggle on /plan is reachable and operable by keyboard alone", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/plan");

    const fallButton = page.getByRole("button", { name: "Fall", exact: true });
    const winterButton = page.getByRole("button", { name: "Winter", exact: true });
    await expect(fallButton).toHaveAttribute("aria-pressed", "true");

    // No mouse: focus directly (as Tab would land) and activate with the keyboard.
    await winterButton.focus();
    await expect(winterButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(winterButton).toHaveAttribute("aria-pressed", "true");
    await expect(fallButton).toHaveAttribute("aria-pressed", "false");
  });

  test("the subject filter select opens and closes with the keyboard", async ({ page }) => {
    await loginAs(page, "marcus.chen@uwo.ca");
    await page.goto("/plan");

    const trigger = page.getByLabel("Filter by subject");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "All subjects" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });
});

test.describe("Phase 7: mobile layout (375px viewport)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  for (const { name, path, role } of [
    { name: "dashboard", path: "/dashboard", role: "student" as const },
    { name: "course search + schedule builder", path: "/plan", role: "student" as const },
    { name: "advisor chat", path: "/chat", role: "student" as const },
    { name: "academic file", path: "/academic-file", role: "student" as const },
    { name: "counsellor caseload roster", path: "/counsellor", role: "counsellor" as const },
  ]) {
    test(`no horizontal overflow on ${name}`, async ({ page }) => {
      await loginAs(page, role === "student" ? "marcus.chen@uwo.ca" : "r.stevens@uwo.ca");
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("no horizontal overflow on counsellor student detail (one-pager with tabs)", async ({ page }) => {
    await loginAs(page, "r.stevens@uwo.ca");
    await page.getByText("Marcus Chen").click();
    await page.waitForURL(/\/counsellor\/.+/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
