/**
 * Performance fixture (PRODUCT_REQUIREMENTS §7): a SYNTHETIC store with N orders (default 100,000) over two years,
 * written to its own database so it can never mix with live or demo data. Raw Shopify-shaped facts are generated
 * in SQL; profit results are then computed by the real ProfitService, exactly like a synced store.
 *
 *   PERF_DATABASE_URL=postgres://…/profitlens_perf pnpm --filter @profitlens/core exec tsx perf/seed.ts [orders]
 */
import { createDb, createPool, schema } from "@profitlens/db";
import { runMigrations } from "@profitlens/db/migrate";
import { sql } from "drizzle-orm";
import { ProfitService } from "../src/profit/service";

const url = process.env.PERF_DATABASE_URL;
if (!url || !/perf/.test(new URL(url).pathname)) throw new Error("PERF_DATABASE_URL must point at a dedicated *perf* database");
const ORDERS = Number(process.argv[2] ?? 100_000);
const END = "2026-10-18";
const DAYS = 730;

await runMigrations(url);
const pool = createPool(url, 4);
const db = createDb(pool);
await db.execute(sql`TRUNCATE "organization", "user" RESTART IDENTITY CASCADE`);

const userId = "perf-owner";
await db.insert(schema.user).values({ id: userId, name: "Perf Owner", email: "perf-owner@example.com" });
const [org] = await db.insert(schema.organization).values({ name: "Perf (synthetic)" }).returning();
await db.insert(schema.membership).values({ organizationId: org!.id, userId, role: "owner" });
const [st] = await db
  .insert(schema.store)
  .values({ organizationId: org!.id, shopDomain: "perf-synthetic.myshopify.com", name: "PERF SYNTHETIC", currency: "AUD", ianaTimezone: "Australia/Sydney", status: "active", thirdPartyFeeRate: "2" })
  .returning();
const storeId = st!.id;
await db.insert(schema.financialPolicy).values({ storeId, version: 1, settings: {} });
await db.insert(schema.shippingRule).values({ storeId, name: "Flat", type: "per_order", params: { amount: "8.50" }, currency: "AUD", effectiveFrom: "2020-01-01" });

const t0 = Date.now();
const step = async (label: string, q: ReturnType<typeof sql>) => {
  const s = Date.now();
  await db.execute(q);
  await db.execute(sql`analyze`); // fresh statistics so the next step's joins get sensible plans
  console.log(`${label}: ${((Date.now() - s) / 1000).toFixed(1)} s`);
};

await step(
  "products + variants + costs",
  sql`
  with p as (
    insert into product (store_id, shopify_gid, title, status)
    select ${storeId}, 'gid://shopify/Product/' || g, 'Product ' || g, 'ACTIVE' from generate_series(1, 500) g returning id, shopify_gid
  ), v as (
    insert into variant (store_id, product_id, shopify_gid, title, sku, price, weight_grams)
    select ${storeId}, p.id, p.shopify_gid || '-' || k, 'Size ' || k, 'SKU-' || substr(p.shopify_gid, 23) || '-' || k, (20 + (k * 7) % 60)::numeric, 300
    from p, generate_series(1, 4) k returning id, price
  )
  insert into variant_cost_version (store_id, variant_id, effective_from, currency, product_cost, source)
  select ${storeId}, v.id, '2020-01-01', 'AUD', round(v.price * 0.35, 2), 'manual' from v where random() < 0.97`,
);
await step(
  "customers",
  sql`insert into customer (store_id, shopify_gid, country_code) select ${storeId}, 'gid://shopify/Customer/' || g, case when g % 10 = 0 then 'NZ' else 'AU' end from generate_series(1, ${Math.round(ORDERS * 0.3)}) g`,
);
await step(
  "orders",
  sql`
  insert into "order" (store_id, shopify_gid, name, customer_id, created_at_shopify, processed_at, processed_local_date, currency, financial_status,
                       shipping_country_code, utm_source, utm_campaign, shopify_updated_at, total_price)
  select ${storeId}, 'gid://shopify/Order/' || g, '#' || (1000 + g), c.id, ts, ts, (ts at time zone 'Australia/Sydney')::date, 'AUD', 'PAID',
         c.country_code, case when g % 5 < 3 then 'google' when g % 5 = 3 then 'facebook' end,
         case when g % 5 < 3 then 'campaign-' || (g % 12) end, ts, 0
  from generate_series(1, ${ORDERS}) g
  cross join lateral (select (${END}::date - (${DAYS} * g / ${ORDERS})::int + 1)::timestamp at time zone 'Australia/Sydney' + make_interval(secs => (g * 7919) % 86000) as ts) t
  join customer c on c.store_id = ${storeId} and c.shopify_gid = 'gid://shopify/Customer/' || (1 + (g * 2654435761) % ${Math.round(ORDERS * 0.3)})`,
);
await step(
  "line items",
  sql`
  insert into order_line_item (store_id, order_id, shopify_gid, variant_id, variant_gid, title, quantity, current_quantity, original_unit_price)
  select o.store_id, o.id, o.shopify_gid || '/L' || k, v.id, v.shopify_gid, 'Item', 1 + (n % 3), 1 + (n % 3), v.price
  from "order" o
  cross join lateral (select substr(o.shopify_gid, 21)::int as n) x
  cross join generate_series(1, 1 + x.n % 3) k
  join variant v on v.store_id = o.store_id and v.shopify_gid = 'gid://shopify/Product/' || (1 + (x.n * k * 31) % 500) || '-' || (1 + k % 4)
  where o.store_id = ${storeId}`,
);
await step(
  "sales ledger (product + shipping)",
  sql`
  insert into sale_ledger_entry (store_id, order_id, sale_gid, agreement_gid, agreement_type, happened_at, happened_local_date, action_type, line_type,
                                 line_item_gid, quantity, total_amount, total_discount_before_taxes, total_discount_after_taxes, total_tax_amount)
  select li.store_id, li.order_id, li.shopify_gid || '/S', o.shopify_gid || '/A', 'OrderAgreement', o.processed_at, o.processed_local_date, 'ORDER'::sale_action_type, 'PRODUCT'::sale_line_type,
         li.shopify_gid, li.quantity, round(li.original_unit_price * li.quantity * 1.1 * 0.9, 2), round(li.original_unit_price * li.quantity * 0.1, 2),
         round(li.original_unit_price * li.quantity * 0.11, 2), round(li.original_unit_price * li.quantity * 0.09, 2)
  from order_line_item li join "order" o on o.id = li.order_id where li.store_id = ${storeId}
  union all
  select o.store_id, o.id, o.shopify_gid || '/SHIP', o.shopify_gid || '/A', 'OrderAgreement', o.processed_at, o.processed_local_date, 'ORDER'::sale_action_type, 'SHIPPING'::sale_line_type,
         null, null::int, 11.00, 0, 0, 1.00
  from "order" o where o.store_id = ${storeId}`,
);
await step(
  "refunds (5 % of orders, one unit returned 3–20 days later)",
  sql`
  with r as (
    select li.*, o.shopify_gid as order_gid, o.processed_at + make_interval(days => 3 + substr(o.shopify_gid, 21)::int % 18) as at
    from order_line_item li join "order" o on o.id = li.order_id
    where li.store_id = ${storeId} and substr(o.shopify_gid, 21)::int % 20 = 7 and li.shopify_gid like '%/L1'
  ), rf as (
    insert into refund (store_id, order_id, shopify_gid, created_at_shopify, total_refunded)
    select store_id, order_id, order_gid || '/R1', at, original_unit_price from r returning id, shopify_gid
  ), rli as (
    insert into refund_line_item (store_id, refund_id, shopify_gid, line_item_gid, quantity, restock_type, restocked, subtotal)
    select r.store_id, rf.id, rf.shopify_gid || '/RL', r.shopify_gid, 1, 'RETURN', true, r.original_unit_price
    from r join rf on rf.shopify_gid = r.order_gid || '/R1' returning 1
  )
  insert into sale_ledger_entry (store_id, order_id, sale_gid, agreement_gid, agreement_type, refund_gid, happened_at, happened_local_date, action_type, line_type,
                                 line_item_gid, quantity, total_amount, total_discount_before_taxes, total_discount_after_taxes, total_tax_amount)
  select r.store_id, r.order_id, r.shopify_gid || '/RS', r.order_gid || '/RA', 'RefundAgreement', r.order_gid || '/R1', r.at, (r.at at time zone 'Australia/Sydney')::date,
         'RETURN', 'PRODUCT', r.shopify_gid, -1, -round(r.original_unit_price * 1.1 * 0.9, 2), -round(r.original_unit_price * 0.1, 2), -round(r.original_unit_price * 0.11, 2),
         -round(r.original_unit_price * 0.09, 2)
  from r`,
);
await step(
  "payments (Shopify Payments with fees; every 10th order PayPal without a fee)",
  sql`
  insert into payment_transaction (store_id, order_id, shopify_gid, kind, status, gateway, amount, currency, processed_at, processed_local_date, fee_amount)
  select o.store_id, o.id, o.shopify_gid || '/T', 'SALE', 'SUCCESS', case when n % 10 = 0 then 'paypal' else 'shopify_payments' end,
         t.total, 'AUD', o.processed_at, o.processed_local_date, case when n % 10 = 0 then null else round(t.total * 0.0175 + 0.30, 2) end
  from "order" o cross join lateral (select substr(o.shopify_gid, 21)::int as n) x
  cross join lateral (select coalesce(sum(total_amount), 0) as total from sale_ledger_entry s where s.order_id = o.id and s.action_type = 'ORDER') t
  where o.store_id = ${storeId}`,
);
await step(
  "customer stats",
  sql`update customer c set orders_count = s.n, first_order_at = s.first_at, first_order_local_date = (s.first_at at time zone 'Australia/Sydney')::date
      from (select customer_id, count(*) n, min(processed_at) first_at from "order" where store_id = ${storeId} group by 1) s where s.customer_id = c.id`,
);
await step(
  "ad spend (2 years × 12 campaigns)",
  sql`
  with acct as (
    insert into ad_account (organization_id, store_id, platform, external_id, name, currency, timezone, sync_enabled)
    values (${org!.id}, ${storeId}, 'google_ads', '1234567890', 'Perf Google Ads', 'AUD', 'Australia/Sydney', true) returning id
  ), camp as (
    insert into ad_campaign (ad_account_id, external_id, name) select acct.id, 'c' || k, 'campaign-' || k from acct, generate_series(0, 11) k returning ad_account_id, external_id
  )
  insert into ad_spend_daily (ad_account_id, level, entity_external_id, date, source, spend, conversion_value)
  select camp.ad_account_id, 'campaign', camp.external_id, d::date, 'api', round((40 + substr(camp.external_id, 2)::int * 3 + extract(dow from d) * 2)::numeric, 2), 150
  from camp, generate_series((${END}::date - ${DAYS - 1}::int)::timestamp, ${END}::date::timestamp, interval '1 day') d`,
);
await db.execute(sql`analyze`);
console.log(`facts loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const r0 = Date.now();
const stats = await new ProfitService(db).recalcStore(storeId);
console.log(`recalcStore: ${JSON.stringify(stats)} in ${((Date.now() - r0) / 1000).toFixed(1)} s`);
await db.execute(sql`analyze`);
console.log(`store ${storeId} (organization ${org!.id})`);
await pool.end();
