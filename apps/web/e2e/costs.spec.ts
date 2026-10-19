import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

/**
 * Cost management against a seeded connected store: one product with two variants and one order without
 * costs. Every change goes through the real server actions, finance engine and recalculation.
 */
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens";
const TZ = "Australia/Sydney";

async function seedStore(email: string): Promise<string> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const suffix = Math.random().toString(36).slice(2, 10);
    const { rows: org } = await client.query(`select m.organization_id from membership m join "user" u on u.id = m.user_id where u.email = $1`, [email]);
    const orgId = org[0].organization_id as string;
    const { rows: st } = await client.query(
      `insert into store (organization_id, shop_domain, name, currency, iana_timezone, status) values ($1, $2, 'E2E Boutique', 'AUD', $3, 'active') returning id`,
      [orgId, `e2e-${suffix}.myshopify.com`, TZ],
    );
    const storeId = st[0].id as string;
    await client.query(`insert into financial_policy (store_id, version, settings) values ($1, 1, '{}')`, [storeId]);
    const { rows: p } = await client.query(`insert into product (store_id, shopify_gid, title) values ($1, $2, 'Sneaker') returning id`, [storeId, `gid://shopify/Product/${suffix}`]);
    const variant = async (sku: string, title: string) =>
      (
        await client.query(`insert into variant (store_id, product_id, shopify_gid, title, sku, price) values ($1, $2, $3, $4, $5, '100') returning id`, [
          storeId,
          p[0].id,
          `gid://shopify/ProductVariant/${suffix}-${sku}`,
          title,
          sku,
        ])
      ).rows[0].id as string;
    const v1 = await variant("SNK-8", "Black / 8");
    await variant("SNK-9", "White / 9");
    const { rows: o } = await client.query(
      `insert into "order" (store_id, shopify_gid, name, created_at_shopify, processed_at, processed_local_date, currency, financial_status, shipping_country_code, shopify_updated_at)
       values ($1, $2, '#E2E1', now(), now(), $3, 'AUD', 'PAID', 'AU', now()) returning id`,
      [storeId, `gid://shopify/Order/${suffix}`, today],
    );
    await client.query(
      `insert into order_line_item (store_id, order_id, shopify_gid, variant_id, title, variant_title, sku, quantity, current_quantity, original_unit_price)
       values ($1, $2, $3, $4, 'Sneaker', 'Black / 8', 'SNK-8', 2, 2, '100')`,
      [storeId, o[0].id, `gid://shopify/LineItem/${suffix}`, v1],
    );
    await client.query(
      `insert into sale_ledger_entry (store_id, order_id, sale_gid, agreement_gid, agreement_type, happened_at, happened_local_date, action_type, line_type,
         line_item_gid, quantity, total_amount, total_discount_before_taxes, total_discount_after_taxes, total_tax_amount)
       values ($1, $2, $3, $4, 'OrderAgreement', now(), $5, 'ORDER', 'PRODUCT', $6, 2, '180', '20', '20', '0')`,
      [storeId, o[0].id, `gid://shopify/Sale/${suffix}`, `gid://shopify/SalesAgreement/${suffix}`, today, `gid://shopify/LineItem/${suffix}`],
    );
    return storeId;
  } finally {
    await client.end();
  }
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Name" }).fill("Cost Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard**");
}

test("configure costs for a connected store and see profit recalculated", async ({ page }) => {
  const email = `e2e-costs-${test.info().project.name}-${Date.now()}@example.com`;
  await signUp(page, email);
  const storeId = await seedStore(email);
  const q = `store=${storeId}`;

  // Product costs: the sold variant is flagged; one cost for the whole product.
  await page.goto(`/costs/products?${q}`);
  await expect(page.getByText("1 sold item has no cost")).toBeVisible();
  await page.getByRole("button", { name: "Edit cost of Sneaker — Black / 8" }).click();
  await page.getByRole("textbox", { name: "Product cost" }).fill("30");
  await page.getByRole("textbox", { name: "Inbound shipping" }).fill("1.50");
  await page.getByText("Apply to all 2 variants of this product").click();
  await page.getByRole("button", { name: "Save cost" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Cost saved. Recalculated 1 order." })).toBeVisible();
  await expect(page.getByText("All history · Bulk edit")).toBeVisible(); // applied to both variants
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByText("sold item has no cost")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "$31.50" }).first()).toBeVisible();

  // CSV import: preview shows the diff and the bad row; only valid rows are applied.
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.getByRole("textbox", { name: "…or paste it" }).fill("sku,product_cost,effective_from\nSNK-9,28.50,\nNOPE,1,");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Line 3: No variant with SKU \"NOPE\" in this store.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "$28.50" })).toBeVisible();
  await page.getByRole("button", { name: "Import 1 cost" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 1 cost, skipped 1 row with errors." })).toBeVisible();
  await page.keyboard.press("Escape");

  // Shipping rule: shipping cost stops being missing.
  await page.goto(`/costs/shipping?${q}`);
  await expect(page.getByText("No shipping rules yet")).toBeVisible();
  await page.getByRole("button", { name: "Add shipping rule" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("AU Post");
  await page.getByRole("textbox", { name: "Cost per order" }).fill("8.50");
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Shipping rule added. Recalculated 1 order." })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("cell", { name: "$8.50 per order" })).toBeVisible();

  // Fees and expenses.
  await page.goto(`/costs/fees?${q}`);
  await page.getByLabel("Payment gateway").fill("paypal");
  await page.getByRole("textbox", { name: "Rate %" }).fill("2.6");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Fee rule added." })).toBeVisible();
  await page.getByRole("textbox", { name: "Rate %" }).fill("abc");
  await page.getByLabel("Payment gateway").fill("stripe");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter a percentage like 2.9." })).toBeVisible();

  await page.goto(`/costs/expenses?${q}`);
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Shopify plan");
  await page.getByRole("textbox", { name: "Amount" }).fill("39");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Expense added." })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("cell", { name: "$39.00" })).toBeVisible();

  // Policy: a new version recalculates the store.
  await page.goto(`/settings/policy?${q}`);
  await page.getByText("Count tips as revenue").click();
  await page.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved as version 2. Recalculated 1 order." })).toBeVisible();

  // Reports for the live store use the configured costs: 180 revenue − 63 COGS − 8.50 shipping.
  await page.goto(`/orders?${q}&preset=last_7_days`);
  await expect(page.getByRole("cell", { name: "#E2E1" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "$108.50" })).toBeVisible();
});
