import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

/**
 * Automated accessibility scan (WCAG 2.0/2.1/2.2 A + AA rules in axe-core) of every page, in light and dark mode,
 * with demo data and with a connected store (so the cost forms render). Desktop only: one extra sign-up keeps the
 * suite inside the 5-per-minute sign-up limit (D-021). Any violation fails with the rule, impact and elements.
 */
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const problems = result.violations.map((v) => `${label}: [${v.impact}] ${v.id} — ${v.help}\n    ${v.nodes.slice(0, 5).map((n) => n.target.join(" ")).join("\n    ")}`);
  return problems;
}

test("every page passes the axe WCAG 2.2 AA rules in light and dark mode", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "desktop only (sign-up rate limit)");
  test.setTimeout(240_000);
  const problems: string[] = [];

  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    problems.push(...(await scan(page, path)));
  }

  const email = `e2e-a11y-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("A11y Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard**");

  // Keyboard: the first Tab in the app reaches "Skip to main content", which moves focus to the page content.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeVisible();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("main");

  const demoPages = ["/dashboard", "/orders", "/products", "/pnl", "/customers", "/advertising", "/settings/policy", "/settings/stores", "/settings/sync", "/settings/team"];
  await page.goto("/products");
  const firstProduct = await page.locator('a[href^="/products/"]').first().getAttribute("href");
  if (firstProduct) demoPages.push(firstProduct.split("?")[0]!);

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of demoPages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      problems.push(...(await scan(page, `${path} (${scheme})`)));
    }
  }

  // A connected store makes the cost pages render their forms and tables.
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`select m.organization_id from membership m join "user" u on u.id = m.user_id where u.email = $1`, [email]);
    const { rows: st } = await client.query(
      `insert into store (organization_id, shop_domain, name, currency, iana_timezone, status) values ($1, $2, 'A11y Store', 'AUD', 'Australia/Sydney', 'active') returning id`,
      [rows[0].organization_id, `a11y-${Date.now()}.myshopify.com`],
    );
    await client.query(`insert into financial_policy (store_id, version, settings) values ($1, 1, '{}')`, [st[0].id]);
  } finally {
    await client.end();
  }
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of ["/costs/products", "/costs/shipping", "/costs/fees", "/costs/expenses", "/costs/ad-spend", "/settings/stores"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      problems.push(...(await scan(page, `${path} with a store (${scheme})`)));
    }
  }

  expect(problems, problems.join("\n")).toEqual([]);
});

test("keyboard: sign-in form in reading order with a visible focus indicator on every stop", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "desktop only");
  const focused = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { label: el.getAttribute("aria-label") ?? el.getAttribute("name") ?? (el.textContent ?? "").trim().slice(0, 40), indicator: (s.outlineStyle !== "none" && s.outlineWidth !== "0px") || s.boxShadow !== "none" };
    });

  // Sign-in form: fields, button and link in reading order, each with a focus indicator.
  await page.goto("/login");
  const order: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    const f = await focused();
    expect(f?.indicator, `focus indicator on ${f?.label}`).toBe(true);
    order.push(f!.label);
  }
  expect(order).toEqual(["email", "password", "Sign in", "Create an account"]);
});
