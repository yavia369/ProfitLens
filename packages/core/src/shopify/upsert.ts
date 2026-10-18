import { schema, type Database } from "@profitlens/db";
import type { OrderFacts, ProductFacts } from "@profitlens/shopify";
import { and, eq, getTableColumns, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

/** Builds `{ col: excluded.col }` for an upsert, for the given TS keys of a table. */
function excludedSet<T extends PgTable>(table: T, keys: readonly string[]): Record<string, SQL> {
  const cols = getTableColumns(table) as Record<string, { name: string }>;
  const out: Record<string, SQL> = {};
  for (const k of keys) {
    const c = cols[k];
    if (c) out[k] = sql.raw(`excluded."${c.name}"`);
  }
  return out;
}

export interface UpsertOrderResult {
  readonly orderId: string | null;
  /** false when the incoming payload was older than what is stored (out-of-order delivery). */
  readonly applied: boolean;
}

/**
 * Idempotently stores one order and all its child facts. The order row is only overwritten when the
 * incoming Shopify `updatedAt` is not older than the stored one; child collections are then replaced
 * atomically in the same transaction, so re-imports never duplicate rows.
 */
export async function upsertOrderFacts(db: Database, storeId: string, f: OrderFacts): Promise<UpsertOrderResult> {
  return db.transaction(async (tx) => {
    let customerId: string | null = null;
    if (f.order.customerGid) {
      const [c] = await tx
        .insert(schema.customer)
        .values({ storeId, shopifyGid: f.order.customerGid, countryCode: f.order.shippingCountryCode })
        .onConflictDoUpdate({
          target: [schema.customer.storeId, schema.customer.shopifyGid],
          set: { countryCode: sql`coalesce(excluded.country_code, ${schema.customer.countryCode})` },
        })
        .returning({ id: schema.customer.id });
      customerId = c?.id ?? null;
    }

    const { customerGid: _c, ...orderValues } = f.order;
    const values = { storeId, customerId, ...orderValues, syncedAt: new Date() };
    const updatable = Object.keys(values).filter((k) => k !== "storeId" && k !== "shopifyGid");
    const [row] = await tx
      .insert(schema.order)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.order.storeId, schema.order.shopifyGid],
        set: excludedSet(schema.order, updatable),
        setWhere: sql`${schema.order.shopifyUpdatedAt} <= excluded.shopify_updated_at`,
      })
      .returning({ id: schema.order.id });
    if (!row) return { orderId: null, applied: false };
    const orderId = row.id;

    // Replace children.
    await tx.delete(schema.orderLineItem).where(eq(schema.orderLineItem.orderId, orderId));
    await tx.delete(schema.saleLedgerEntry).where(eq(schema.saleLedgerEntry.orderId, orderId));
    await tx.delete(schema.refund).where(eq(schema.refund.orderId, orderId)); // cascades refund_line_item
    await tx.delete(schema.paymentTransaction).where(eq(schema.paymentTransaction.orderId, orderId));
    await tx.delete(schema.fulfillment).where(eq(schema.fulfillment.orderId, orderId));

    const variantGids = [...new Set(f.lineItems.map((l) => l.variantGid).filter((g): g is string => g !== null))];
    const variantMap = new Map<string, string>();
    if (variantGids.length) {
      const rows = await tx
        .select({ id: schema.variant.id, gid: schema.variant.shopifyGid })
        .from(schema.variant)
        .where(and(eq(schema.variant.storeId, storeId), inArray(schema.variant.shopifyGid, variantGids)));
      for (const r of rows) variantMap.set(r.gid, r.id);
    }

    if (f.lineItems.length) {
      await tx.insert(schema.orderLineItem).values(
        f.lineItems.map((l) => ({ storeId, orderId, ...l, variantId: l.variantGid ? (variantMap.get(l.variantGid) ?? null) : null })),
      );
    }
    if (f.sales.length) {
      await tx.insert(schema.saleLedgerEntry).values(f.sales.map((s) => ({ storeId, orderId, ...s })));
    }
    for (const r of f.refunds) {
      const { lineItems, ...refundValues } = r;
      const [inserted] = await tx.insert(schema.refund).values({ storeId, orderId, ...refundValues }).returning({ id: schema.refund.id });
      if (lineItems.length) {
        await tx.insert(schema.refundLineItem).values(lineItems.map((li) => ({ storeId, refundId: inserted!.id, ...li })));
      }
    }
    if (f.transactions.length) {
      await tx.insert(schema.paymentTransaction).values(f.transactions.map((t) => ({ storeId, orderId, ...t })));
    }
    if (f.fulfillments.length) {
      await tx.insert(schema.fulfillment).values(f.fulfillments.map((x) => ({ storeId, orderId, ...x })));
    }
    return { orderId, applied: true };
  });
}

export interface UpsertProductResult {
  readonly variants: number;
  readonly costVersionsCreated: number;
}

/**
 * Stores a product and its variants. Shopify's "cost per item" is current-only, so it seeds an
 * effective-dated cost version (source shopify_sync):
 * - no version yet → open version from `seedFrom` (documented: current cost applied to past orders);
 * - open shopify_sync version with a different cost → close it today and open a new one from today;
 * - latest version is manual/CSV/supplier → never overwritten (the merchant's value wins).
 */
export async function upsertProductFacts(db: Database, storeId: string, currency: string, f: ProductFacts, today: string, seedFrom: string): Promise<UpsertProductResult> {
  return db.transaction(async (tx) => {
    const [p] = await tx
      .insert(schema.product)
      .values({ storeId, ...f.product, deletedAt: null })
      .onConflictDoUpdate({
        target: [schema.product.storeId, schema.product.shopifyGid],
        set: excludedSet(schema.product, ["title", "status", "productType", "vendor", "shopifyUpdatedAt", "deletedAt"]),
      })
      .returning({ id: schema.product.id });
    let created = 0;
    for (const v of f.variants) {
      const { unitCost, unitCostCurrency: _cur, ...variantValues } = v;
      const [row] = await tx
        .insert(schema.variant)
        .values({ storeId, productId: p!.id, ...variantValues, shopifyUnitCost: unitCost, deletedAt: null })
        .onConflictDoUpdate({
          target: [schema.variant.storeId, schema.variant.shopifyGid],
          set: excludedSet(schema.variant, ["productId", "inventoryItemGid", "title", "sku", "price", "shopifyUnitCost", "weightGrams", "requiresShipping", "shopifyUpdatedAt", "deletedAt"]),
        })
        .returning({ id: schema.variant.id });
      if (unitCost !== null) created += await syncShopifyCostVersion(tx, storeId, row!.id, currency, unitCost, today, seedFrom);
    }
    return { variants: f.variants.length, costVersionsCreated: created };
  });
}

async function syncShopifyCostVersion(tx: Executor, storeId: string, variantId: string, currency: string, unitCost: string, today: string, seedFrom: string): Promise<number> {
  const open = await tx
    .select()
    .from(schema.variantCostVersion)
    .where(and(eq(schema.variantCostVersion.variantId, variantId), isNull(schema.variantCostVersion.effectiveTo)))
    .limit(1);
  const current = open[0];
  const note = "Seeded from Shopify cost per item (Shopify keeps only the current value; it is applied to earlier orders until edited).";
  if (!current) {
    const any = await tx.select({ id: schema.variantCostVersion.id }).from(schema.variantCostVersion).where(eq(schema.variantCostVersion.variantId, variantId)).limit(1);
    if (any.length) return 0; // history exists but is closed: the merchant manages it; don't reopen
    await tx.insert(schema.variantCostVersion).values({ storeId, variantId, effectiveFrom: seedFrom, currency, productCost: unitCost, source: "shopify_sync", note });
    return 1;
  }
  if (current.source !== "shopify_sync") return 0;
  // Both values are NUMERIC(20,6) strings with fixed scale, so string equality is exact.
  if (current.productCost === unitCost) return 0;
  if (current.effectiveFrom >= today) {
    await tx.update(schema.variantCostVersion).set({ productCost: unitCost }).where(eq(schema.variantCostVersion.id, current.id));
    return 0;
  }
  await tx.update(schema.variantCostVersion).set({ effectiveTo: today }).where(eq(schema.variantCostVersion.id, current.id));
  await tx.insert(schema.variantCostVersion).values({
    storeId,
    variantId,
    effectiveFrom: today,
    currency,
    productCost: unitCost,
    source: "shopify_sync",
    note: "Shopify cost per item changed; new version from this date.",
  });
  return 1;
}

/** Recomputes first-order dates and order counts for customers of a store (cheap set-based SQL). */
export async function refreshCustomerStats(db: Database, storeId: string): Promise<void> {
  await db.execute(sql`
    update customer c set
      first_order_at = s.first_at,
      first_order_local_date = s.first_date,
      orders_count = s.n,
      updated_at = now()
    from (
      select customer_id, min(processed_at) as first_at, min(processed_local_date) as first_date, count(*)::int as n
      from "order" where store_id = ${storeId} and customer_id is not null and test = false
      group by customer_id
    ) s
    where c.id = s.customer_id and c.store_id = ${storeId}`);
}

/** Links line items to variants that were imported after the order (e.g. product sync ran later). */
export async function relinkLineItemVariants(db: Database, storeId: string): Promise<number> {
  const res = await db.execute(sql`
    update order_line_item li set variant_id = v.id
    from variant v
    where li.store_id = ${storeId} and v.store_id = ${storeId} and li.variant_id is null and li.variant_gid = v.shopify_gid`);
  return res.rowCount ?? 0;
}
