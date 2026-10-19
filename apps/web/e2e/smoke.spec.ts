import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SCREENSHOT_DIR;
const PASSWORD = "correct-horse-battery";

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// One account per device profile keeps the suite within the auth rate limits (5 sign-ups/min/IP).
test.describe.serial("auth and dashboard", () => {
  let email = "";

  test("unauthenticated users are redirected to sign in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("sign up lands on the demo dashboard with a visible demo banner and real figures", async ({ page }) => {
    email = `e2e-${test.info().project.name}-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Name").fill("E2E Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard**");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: "Demo data." })).toBeVisible();
    await expect(page.getByText("Net profit is incomplete for this period")).toBeVisible();
    await expect(page.locator("p.tabular").first()).toContainText("$");
    await expect(page.getByText("Revenue, costs and net profit")).toBeVisible();
    await shot(page, "dashboard");

    // Filters live in the URL (shareable state).
    await page.getByRole("button", { name: /Date range/ }).click();
    await page.getByRole("button", { name: "Last 7 days" }).click();
    await expect(page).toHaveURL(/preset=last_7_days/);
  });

  test("rejects a wrong password", async ({ page }) => {
    await signIn(page, email, "not-the-password");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("report pages render demo data: orders (with breakdown), products, P&L, settings", async ({ page, isMobile }) => {
    await signIn(page, email);
    await page.waitForURL("**/dashboard**");

    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "Orders" }).click();
    } else {
      await page.getByRole("link", { name: "Orders" }).click();
    }
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
    await expect(page.getByText(/\d[\d,]* orders/)).toBeVisible();
    await shot(page, "orders");
    await page.locator("tbody tr").first().getByRole("button").click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("How this order's profit is calculated")).toBeVisible();
    await expect(drawer.getByText("Order profit (before ads)")).toBeVisible();
    await shot(page, "order-drawer");
    await page.keyboard.press("Escape");

    await page.goto("/products?store=demo&preset=last_30_days");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(page.getByText("Trail Runner Sneaker").first()).toBeVisible();
    await shot(page, "products");

    await page.goto("/pnl?store=demo&preset=this_year&granularity=month");
    await expect(page.getByText("Management report — not an accounting statement")).toBeVisible();
    await page.getByRole("button", { name: "Ad spend" }).click();
    await expect(page.getByRole("cell", { name: "Google Ads" })).toBeVisible();
    await shot(page, "pnl");

    await page.goto("/customers?store=demo&preset=last_30_days");
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await expect(page.getByText("Revenue per customer").first()).toBeVisible();
    await expect(page.getByRole("table", { name: /by cohort and months since first order/ })).toBeVisible();
    await page.getByLabel("Cohort measure").selectOption("retention");
    await expect(page.getByRole("cell", { name: "100%" }).first()).toBeVisible();
    await shot(page, "customers");

    await page.goto("/advertising?store=demo&preset=last_30_days");
    await expect(page.getByRole("heading", { name: "Advertising" })).toBeVisible();
    await expect(page.getByRole("cell", { name: /Shopping - All products/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "No campaign with this name or id" }).first()).toBeVisible();
    await shot(page, "advertising");

    await page.goto("/settings/policy");
    await expect(page.getByText("Taxes collected are a liability, never revenue.")).toBeVisible();
    await page.goto("/costs/products");
    await expect(page.getByText("No connected store yet")).toBeVisible();

    await page.goto("/settings/sync");
    await expect(page.getByText("No stores connected")).toBeVisible();
    await page.goto("/settings/stores");
    await expect(page.getByLabel("Client secret")).toHaveAttribute("type", "password");
    // Server-side validation rejects a bad domain before anything reaches Shopify.
    await page.getByLabel("Store domain").fill("not a shop");
    await page.getByLabel("Client ID").fill("client-id-123");
    await page.getByLabel("Client secret").fill("client-secret-123");
    await page.getByRole("button", { name: "Connect store" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "myshopify.com domain" })).toBeVisible();
    await shot(page, "stores-connect");
  });

  test("sign in, then sign out", async ({ page }) => {
    await signIn(page, email);
    await page.waitForURL("**/dashboard**");
    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
