import { dec, isLocalDate, todayIn, toMoneyString } from "@profitlens/finance";
import { assertRole, assertStoresInScope, schema, TenantAccessError, type Database, type OrgScope } from "@profitlens/db";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { financialPolicySchema, loadActivePolicy } from "./policy";
import { QUEUES } from "../jobs/queues";
import type { ProfitService } from "./service";

/** Rejected input with a message safe to show to the user. */
export class CostInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostInputError";
  }
}

const amount = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Enter an amount like 12.50 (no currency symbol).");
const PERCENT_RE = /^\d{1,3}(\.\d{1,4})?$/;
const percent = z
  .string()
  .trim()
  .regex(PERCENT_RE, "Enter a percentage like 2.9.")
  // zod keeps checking after a failed regex, so only compare values that parsed.
  .refine((v) => !PERCENT_RE.test(v) || dec(v).lte(100), "A percentage cannot exceed 100.");
const localDate = z.string().refine(isLocalDate, "Enter a date as YYYY-MM-DD.");
const optionalDate = z.union([localDate, z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null);
const dateRangeOk = (v: { effectiveFrom: string; effectiveTo: string | null }) => v.effectiveTo === null || v.effectiveTo > v.effectiveFrom;
const RANGE_MSG = { message: "The end date must be after the start date.", path: ["effectiveTo"] };

/** Inline recalculation up to this many orders; larger changes go to the background worker. */
export const INLINE_RECALC_LIMIT = 2000;

export interface ChangeResult {
  /** Orders whose result depends on the change and must be recalculated. */
  readonly affectedOrderIds: readonly string[];
  /** Change applies to every order of the store (policy). */
  readonly wholeStore?: boolean;
}

async function storeFor(db: Database, scope: OrgScope, storeId: string, write: boolean) {
  if (write) assertRole(scope, "editor");
  await assertStoresInScope(db, scope, [storeId]);
  const [st] = await db.select().from(schema.store).where(eq(schema.store.id, storeId));
  if (!st || st.isDemo) throw new TenantAccessError("costs can only be configured for connected stores");
  return st;
}

async function audit(db: Database, scope: OrgScope, storeId: string, action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) {
  await db.insert(schema.auditLog).values({
    organizationId: scope.organizationId,
    storeId,
    actorUserId: scope.userId,
    action,
    entityType,
    entityId,
    before: before as Record<string, unknown> | null,
    after: after as Record<string, unknown> | null,
  });
}

// =============================================================================================== product costs

export interface VariantCostRow {
  readonly variantId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly sku: string;
  readonly price: string | null;
  /** Units ordered in the store's history: the most-sold items matter most for accuracy. */
  readonly unitsOrdered: number;
  /** Version effective today; null = no cost (COGS missing). */
  readonly current: { readonly id: string; readonly productCost: string; readonly inboundShipping: string; readonly handling: string; readonly landed: string; readonly effectiveFrom: string; readonly source: string } | null;
  readonly versions: number;
}

export async function listVariantCosts(
  db: Database,
  scope: OrgScope,
  storeId: string,
  q: { search?: string; missingOnly?: boolean; page?: number; pageSize?: number },
): Promise<{ rows: VariantCostRow[]; total: number; missingTotal: number; missingSold: number }> {
  const st = await storeFor(db, scope, storeId, false);
  const today = todayIn(st.ianaTimezone);
  const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), 200);
  const page = Math.max(q.page ?? 1, 1);
  const like = q.search?.trim() ? `%${q.search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const current = sql`(select cv.id from variant_cost_version cv where cv.variant_id = v.id and cv.effective_from <= ${today}::date
                        and (cv.effective_to is null or cv.effective_to > ${today}::date) limit 1)`;
  const where = sql`v.store_id = ${storeId} and v.deleted_at is null
    ${like ? sql`and (p.title ilike ${like} or v.title ilike ${like} or v.sku ilike ${like})` : sql``}
    ${q.missingOnly ? sql`and ${current} is null` : sql``}`;
  const [rows, counts] = await Promise.all([
    db.execute(sql`
      select v.id as variant_id, p.id as product_id, p.title as product_title, v.title as variant_title, coalesce(v.sku, '') as sku,
        v.price::text as price, coalesce(u.units, 0)::int as units, ${current} as current_id,
        (select count(*)::int from variant_cost_version cv where cv.variant_id = v.id) as versions
      from variant v join product p on p.id = v.product_id
      left join (select variant_id, sum(quantity) as units from order_line_item where store_id = ${storeId} group by 1) u on u.variant_id = v.id
      where ${where}
      order by coalesce(u.units, 0) desc, p.title, v.title, v.id
      limit ${pageSize} offset ${(page - 1) * pageSize}`),
    db.execute(sql`
      select count(*)::int as total,
        count(*) filter (where ${current} is null)::int as missing,
        count(*) filter (where ${current} is null and exists (select 1 from order_line_item li where li.variant_id = v.id))::int as missing_sold
      from variant v join product p on p.id = v.product_id where ${where}`),
  ]);
  type R = { variant_id: string; product_id: string; product_title: string; variant_title: string; sku: string; price: string | null; units: number; current_id: string | null; versions: number };
  const list = rows.rows as R[];
  const currentIds = list.map((r) => r.current_id).filter((x): x is string => x !== null);
  const versions = currentIds.length ? await db.select().from(schema.variantCostVersion).where(inArray(schema.variantCostVersion.id, currentIds)) : [];
  const byId = new Map(versions.map((v) => [v.id, v]));
  const c = counts.rows[0] as { total: number; missing: number; missing_sold: number };
  return {
    total: c.total,
    missingTotal: c.missing,
    missingSold: c.missing_sold,
    rows: list.map((r) => {
      const v = r.current_id ? byId.get(r.current_id) : undefined;
      return {
        variantId: r.variant_id,
        productId: r.product_id,
        productTitle: r.product_title,
        variantTitle: r.variant_title === "Default Title" ? "" : r.variant_title,
        sku: r.sku,
        price: r.price,
        unitsOrdered: r.units,
        versions: r.versions,
        current: v
          ? {
              id: v.id,
              productCost: v.productCost,
              inboundShipping: v.inboundShipping,
              handling: v.handling,
              landed: toMoneyString(dec(v.productCost).plus(dec(v.inboundShipping)).plus(dec(v.handling))),
              effectiveFrom: v.effectiveFrom,
              source: v.source,
            }
          : null,
      };
    }),
  };
}

/** All live variants of a product (to apply one cost to every size/colour). */
export async function variantIdsOfProduct(db: Database, scope: OrgScope, storeId: string, productId: string): Promise<string[]> {
  await storeFor(db, scope, storeId, false);
  const rows = await db
    .select({ id: schema.variant.id })
    .from(schema.variant)
    .where(and(eq(schema.variant.storeId, storeId), eq(schema.variant.productId, productId), isNull(schema.variant.deletedAt)));
  return rows.map((r) => r.id);
}

export async function variantCostHistory(db: Database, scope: OrgScope, storeId: string, variantId: string) {
  await storeFor(db, scope, storeId, false);
  return db
    .select()
    .from(schema.variantCostVersion)
    .where(and(eq(schema.variantCostVersion.storeId, storeId), eq(schema.variantCostVersion.variantId, variantId)))
    .orderBy(desc(schema.variantCostVersion.effectiveFrom));
}

export const setCostSchema = z.object({
  variantIds: z.array(z.uuid()).min(1).max(5000),
  productCost: amount,
  inboundShipping: amount.default("0"),
  handling: amount.default("0"),
  /** First day (store-local) the cost applies. "all" history: use an early date. */
  effectiveFrom: localDate,
  note: z.string().trim().max(500).optional(),
  source: z.enum(["manual", "csv_import", "bulk_edit"]).default("manual"),
});
export type SetCostInput = z.input<typeof setCostSchema>;

/**
 * Sets a landed cost from a date for one or more variants. The version covering that date is closed on it,
 * a version starting on the same date is replaced, and the new version runs until the next later version
 * (so later, deliberately dated costs are kept). Orders from that date on are recalculated.
 */
export async function setVariantCost(db: Database, scope: OrgScope, storeId: string, raw: SetCostInput): Promise<ChangeResult> {
  const input = setCostSchema.parse(raw);
  const st = await storeFor(db, scope, storeId, true);
  if (!dec(input.handling).isZero() && (await db.select({ id: schema.handlingRule.id }).from(schema.handlingRule).where(eq(schema.handlingRule.storeId, storeId)).limit(1)).length) {
    throw new CostInputError("This store uses handling rules. Set handling there, or delete the rules to include handling in product costs (one handling mode avoids double counting).");
  }
  const variants = await db.select({ id: schema.variant.id }).from(schema.variant).where(and(eq(schema.variant.storeId, storeId), inArray(schema.variant.id, input.variantIds)));
  if (variants.length !== new Set(input.variantIds).size) throw new TenantAccessError("variant not in this store");
  const D = input.effectiveFrom;
  await db.transaction(async (tx) => {
    for (const { id: variantId } of variants) {
      const existing = await tx.select().from(schema.variantCostVersion).where(eq(schema.variantCostVersion.variantId, variantId)).orderBy(asc(schema.variantCostVersion.effectiveFrom));
      const sameDay = existing.find((v) => v.effectiveFrom === D);
      const covering = existing.find((v) => v.effectiveFrom < D && (v.effectiveTo === null || v.effectiveTo > D));
      const next = existing.find((v) => v.effectiveFrom > D);
      if (sameDay) await tx.delete(schema.variantCostVersion).where(eq(schema.variantCostVersion.id, sameDay.id));
      if (covering) await tx.update(schema.variantCostVersion).set({ effectiveTo: D }).where(eq(schema.variantCostVersion.id, covering.id));
      const [created] = await tx
        .insert(schema.variantCostVersion)
        .values({
          storeId,
          variantId,
          effectiveFrom: D,
          effectiveTo: next?.effectiveFrom ?? null,
          currency: st.currency,
          productCost: input.productCost,
          inboundShipping: input.inboundShipping,
          handling: input.handling,
          source: input.source,
          note: input.note ?? null,
          createdByUserId: scope.userId,
        })
        .returning();
      await tx.insert(schema.auditLog).values({
        organizationId: scope.organizationId,
        storeId,
        actorUserId: scope.userId,
        action: "cost_version.set",
        entityType: "variant",
        entityId: variantId,
        before: { replaced: sameDay ?? null, closed: covering ? { id: covering.id, effectiveTo: covering.effectiveTo } : null },
        after: created as unknown as Record<string, unknown>,
      });
    }
  });
  return { affectedOrderIds: await ordersWithVariantsFrom(db, storeId, input.variantIds, D) };
}

async function ordersWithVariantsFrom(db: Database, storeId: string, variantIds: readonly string[], from: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: schema.order.id })
    .from(schema.orderLineItem)
    .innerJoin(schema.order, eq(schema.order.id, schema.orderLineItem.orderId))
    .where(and(eq(schema.order.storeId, storeId), inArray(schema.orderLineItem.variantId, [...variantIds]), sql`${schema.order.processedLocalDate} >= ${from}`));
  return rows.map((r) => r.id);
}

/** Deletes one cost version; the previous version is not extended (the gap becomes "missing", visibly). */
export async function deleteCostVersion(db: Database, scope: OrgScope, storeId: string, versionId: string): Promise<ChangeResult> {
  await storeFor(db, scope, storeId, true);
  const [v] = await db.select().from(schema.variantCostVersion).where(and(eq(schema.variantCostVersion.id, versionId), eq(schema.variantCostVersion.storeId, storeId)));
  if (!v) throw new TenantAccessError("cost version not found");
  await db.delete(schema.variantCostVersion).where(eq(schema.variantCostVersion.id, v.id));
  await audit(db, scope, storeId, "cost_version.delete", "variant", v.variantId, v, null);
  return { affectedOrderIds: await ordersWithVariantsFrom(db, storeId, [v.variantId], v.effectiveFrom) };
}

// ------------------------------------------------------------------------------------------ CSV import / export

export interface CostImportPreview {
  readonly matched: readonly {
    readonly line: number;
    readonly variantId: string;
    readonly label: string;
    readonly productCost: string;
    readonly inboundShipping: string;
    readonly handling: string;
    readonly effectiveFrom: string;
    /** New landed unit cost (product + inbound + handling). */
    readonly landed: string;
    /** Landed cost it replaces on that date; null = none. */
    readonly previous: string | null;
  }[];
  readonly errors: readonly { readonly line: number; readonly message: string }[];
  /** Rows left without a product cost (e.g. untouched rows of an export): ignored, not errors. */
  readonly blank: number;
}

/** Parses one CSV line with quotes ("a, b" and "" escapes). */
function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Validates a cost CSV without writing anything. Columns (header row required, any order):
 * `sku` or `variant_id`, `product_cost`, optional `inbound_shipping`, `handling`, `effective_from` (default: all history).
 */
export async function previewCostImport(db: Database, scope: OrgScope, storeId: string, csv: string): Promise<CostImportPreview> {
  await storeFor(db, scope, storeId, true);
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new CostInputError("The file needs a header row and at least one data row.");
  if (lines.length > 20_001) throw new CostInputError("At most 20,000 rows per import.");
  const header = csvCells(lines[0]!).map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  const col = (n: string) => header.indexOf(n);
  if (col("product_cost") < 0 || (col("sku") < 0 && col("variant_id") < 0)) throw new CostInputError("The header must include product_cost and either sku or variant_id.");

  const variants = await db
    .select({ id: schema.variant.id, sku: schema.variant.sku, title: schema.variant.title, product: schema.product.title })
    .from(schema.variant)
    .innerJoin(schema.product, eq(schema.product.id, schema.variant.productId))
    .where(and(eq(schema.variant.storeId, storeId), isNull(schema.variant.deletedAt)));
  const byId = new Map(variants.map((v) => [v.id, v]));
  const bySku = new Map<string, (typeof variants)[number][]>();
  for (const v of variants) if (v.sku) bySku.set(v.sku.toLowerCase(), [...(bySku.get(v.sku.toLowerCase()) ?? []), v]);

  const matched: CostImportPreview["matched"][number][] = [];
  const errors: CostImportPreview["errors"][number][] = [];
  const seen = new Set<string>();
  let blank = 0;
  const rowSchema = z.object({ productCost: amount, inboundShipping: amount, handling: amount, effectiveFrom: localDate });
  for (let i = 1; i < lines.length; i++) {
    const cells = csvCells(lines[i]!);
    // Undo the export's formula-injection guard ('=…) so exported files re-import unchanged.
    const get = (n: string) => (col(n) >= 0 ? (cells[col(n)] ?? "").replace(/^'(?=[=+\-@])/, "") : "");
    if (get("product_cost") === "") {
      blank += 1;
      continue;
    }
    const idCell = get("variant_id");
    const skuCell = get("sku");
    let variant = idCell ? byId.get(idCell) : undefined;
    if (!variant && skuCell) {
      const hits = bySku.get(skuCell.toLowerCase()) ?? [];
      if (hits.length > 1) {
        errors.push({ line: i + 1, message: `SKU "${skuCell}" matches ${hits.length} variants — use variant_id instead.` });
        continue;
      }
      variant = hits[0];
    }
    if (!variant) {
      errors.push({ line: i + 1, message: `No variant with ${idCell ? `id ${idCell}` : `SKU "${skuCell}"`} in this store.` });
      continue;
    }
    const parsed = rowSchema.safeParse({
      productCost: get("product_cost").replace(/^\$/, ""),
      inboundShipping: get("inbound_shipping") || "0",
      handling: get("handling") || "0",
      effectiveFrom: get("effective_from") || "2000-01-01",
    });
    if (!parsed.success) {
      errors.push({ line: i + 1, message: parsed.error.issues[0]!.message });
      continue;
    }
    const key = `${variant.id}:${parsed.data.effectiveFrom}`;
    if (seen.has(key)) {
      errors.push({ line: i + 1, message: "Duplicate row for the same variant and date." });
      continue;
    }
    seen.add(key);
    const landed = toMoneyString(dec(parsed.data.productCost).plus(dec(parsed.data.inboundShipping)).plus(dec(parsed.data.handling)));
    matched.push({ line: i + 1, variantId: variant.id, label: `${variant.product}${variant.title && variant.title !== "Default Title" ? ` — ${variant.title}` : ""}`, ...parsed.data, landed, previous: null });
  }
  // Show the cost each row replaces (effective on its date), so the preview is a real diff.
  const ids = [...new Set(matched.map((x) => x.variantId))];
  const versions = ids.length ? await db.select().from(schema.variantCostVersion).where(inArray(schema.variantCostVersion.variantId, ids)) : [];
  return {
    errors,
    blank,
    matched: matched.map((x) => {
      const v = versions.find((cv) => cv.variantId === x.variantId && cv.effectiveFrom <= x.effectiveFrom && (cv.effectiveTo === null || cv.effectiveTo > x.effectiveFrom));
      return { ...x, previous: v ? toMoneyString(dec(v.productCost).plus(dec(v.inboundShipping)).plus(dec(v.handling))) : null };
    }),
  };
}

/** Applies a previewed import (re-validated server-side); rows with errors are skipped. */
export async function applyCostImport(db: Database, scope: OrgScope, storeId: string, csv: string): Promise<ChangeResult & { applied: number; skipped: number }> {
  const preview = await previewCostImport(db, scope, storeId, csv);
  const affected = new Set<string>();
  // Group identical (cost, date) rows so a large import is a few transactions, not thousands.
  const groups = new Map<string, { input: SetCostInput; ids: string[] }>();
  for (const r of preview.matched) {
    const k = [r.productCost, r.inboundShipping, r.handling, r.effectiveFrom].join("|");
    const g = groups.get(k) ?? { input: { variantIds: [], productCost: r.productCost, inboundShipping: r.inboundShipping, handling: r.handling, effectiveFrom: r.effectiveFrom, source: "csv_import" }, ids: [] };
    g.ids.push(r.variantId);
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    for (let i = 0; i < g.ids.length; i += 5000) {
      const res = await setVariantCost(db, scope, storeId, { ...g.input, variantIds: g.ids.slice(i, i + 5000) });
      for (const id of res.affectedOrderIds) affected.add(id);
    }
  }
  return { affectedOrderIds: [...affected], applied: preview.matched.length, skipped: preview.errors.length };
}

export async function exportCostsCsv(db: Database, scope: OrgScope, storeId: string): Promise<string> {
  const st = await storeFor(db, scope, storeId, false);
  const today = todayIn(st.ianaTimezone);
  const rows = await db
    .select({ id: schema.variant.id, sku: schema.variant.sku, product: schema.product.title, variant: schema.variant.title, price: schema.variant.price, cv: schema.variantCostVersion })
    .from(schema.variant)
    .innerJoin(schema.product, eq(schema.product.id, schema.variant.productId))
    .leftJoin(
      schema.variantCostVersion,
      and(
        eq(schema.variantCostVersion.variantId, schema.variant.id),
        lte(schema.variantCostVersion.effectiveFrom, today),
        or(isNull(schema.variantCostVersion.effectiveTo), gt(schema.variantCostVersion.effectiveTo, today)),
      ),
    )
    .where(and(eq(schema.variant.storeId, storeId), isNull(schema.variant.deletedAt)))
    .orderBy(asc(schema.product.title), asc(schema.variant.title));
  const esc = (v: string | null | undefined) => {
    const s = v ?? "";
    // Quote, and neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const out = ["variant_id,sku,product,variant,price,product_cost,inbound_shipping,handling,effective_from"];
  for (const r of rows) {
    out.push([r.id, r.sku, r.product, r.variant, r.price, r.cv?.productCost, r.cv?.inboundShipping, r.cv?.handling, r.cv?.effectiveFrom].map((v) => esc(v ?? "")).join(","));
  }
  return `${out.join("\n")}\n`;
}

// =============================================================================================== shipping & handling

const tier = z.object({ minQuantity: z.coerce.number().int().min(1).max(100_000), amount });
export const shippingRuleSchema = z
  .object({
    name: z.string().trim().min(1, "Give the rule a name.").max(100),
    params: z.discriminatedUnion("type", [
      z.object({ type: z.literal("per_order"), amount }),
      z.object({ type: z.literal("per_item"), amount }),
      z.object({ type: z.literal("first_plus_additional"), first: amount, additional: amount }),
      z.object({ type: z.literal("tiered_quantity"), tiers: z.array(tier).min(1).max(20) }),
    ]),
    countryCodes: z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use 2-letter country codes like AU.")).max(250).nullable().default(null),
    priority: z.coerce.number().int().min(1).max(10_000).default(100),
    effectiveFrom: localDate,
    effectiveTo: optionalDate,
  })
  .refine(dateRangeOk, RANGE_MSG);
export type ShippingRuleFormInput = z.input<typeof shippingRuleSchema>;

export async function listShippingRules(db: Database, scope: OrgScope, storeId: string) {
  await storeFor(db, scope, storeId, false);
  return db.select().from(schema.shippingRule).where(eq(schema.shippingRule.storeId, storeId)).orderBy(asc(schema.shippingRule.priority), desc(schema.shippingRule.effectiveFrom));
}

export async function saveShippingRule(db: Database, scope: OrgScope, storeId: string, ruleId: string | null, raw: ShippingRuleFormInput): Promise<ChangeResult> {
  const input = shippingRuleSchema.parse(raw);
  const st = await storeFor(db, scope, storeId, true);
  const { type, ...params } = input.params;
  const values = { name: input.name, type, params, countryCodes: input.countryCodes?.length ? input.countryCodes : null, priority: input.priority, currency: st.currency, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo };
  let before: typeof schema.shippingRule.$inferSelect | null = null;
  let id = ruleId;
  if (ruleId) {
    before = (await db.select().from(schema.shippingRule).where(and(eq(schema.shippingRule.id, ruleId), eq(schema.shippingRule.storeId, storeId))))[0] ?? null;
    if (!before) throw new TenantAccessError("rule not found");
    await db.update(schema.shippingRule).set(values).where(eq(schema.shippingRule.id, ruleId));
  } else {
    const [r] = await db.insert(schema.shippingRule).values({ storeId, ...values }).returning({ id: schema.shippingRule.id });
    id = r!.id;
  }
  await audit(db, scope, storeId, ruleId ? "shipping_rule.update" : "shipping_rule.create", "shipping_rule", id, before, values);
  return { affectedOrderIds: await ordersInRanges(db, storeId, [input, ...(before ? [before] : [])]) };
}

export async function deleteShippingRule(db: Database, scope: OrgScope, storeId: string, ruleId: string): Promise<ChangeResult> {
  await storeFor(db, scope, storeId, true);
  const [before] = await db.select().from(schema.shippingRule).where(and(eq(schema.shippingRule.id, ruleId), eq(schema.shippingRule.storeId, storeId)));
  if (!before) throw new TenantAccessError("rule not found");
  await db.delete(schema.shippingRule).where(eq(schema.shippingRule.id, ruleId));
  await audit(db, scope, storeId, "shipping_rule.delete", "shipping_rule", ruleId, before, null);
  return { affectedOrderIds: await ordersInRanges(db, storeId, [before]) };
}

async function ordersInRanges(db: Database, storeId: string, ranges: readonly { effectiveFrom: string; effectiveTo: string | null }[]): Promise<string[]> {
  const conds = ranges.map((r) => sql`(o.processed_local_date >= ${r.effectiveFrom}::date ${r.effectiveTo ? sql`and o.processed_local_date < ${r.effectiveTo}::date` : sql``})`);
  const res = await db.execute(sql`select o.id from "order" o where o.store_id = ${storeId} and (${sql.join(conds, sql` or `)})`);
  return (res.rows as { id: string }[]).map((r) => r.id);
}

export const handlingRuleSchema = z
  .object({ mode: z.enum(["per_order", "per_item"]), amount, effectiveFrom: localDate, effectiveTo: optionalDate })
  .refine(dateRangeOk, RANGE_MSG);

export async function listHandlingRules(db: Database, scope: OrgScope, storeId: string) {
  await storeFor(db, scope, storeId, false);
  return db.select().from(schema.handlingRule).where(eq(schema.handlingRule.storeId, storeId)).orderBy(desc(schema.handlingRule.effectiveFrom));
}

export async function saveHandlingRule(db: Database, scope: OrgScope, storeId: string, raw: z.input<typeof handlingRuleSchema>): Promise<ChangeResult> {
  const input = handlingRuleSchema.parse(raw);
  const st = await storeFor(db, scope, storeId, true);
  const withHandling = await db
    .select({ id: schema.variantCostVersion.id })
    .from(schema.variantCostVersion)
    .where(and(eq(schema.variantCostVersion.storeId, storeId), sql`${schema.variantCostVersion.handling} > 0`))
    .limit(1);
  if (withHandling.length) throw new CostInputError("Some product costs include per-unit handling. Use one handling mode: remove handling from product costs first, or keep it there.");
  const overlapping = (await listHandlingRules(db, scope, storeId)).filter((r) => r.effectiveFrom < (input.effectiveTo ?? "9999-12-31") && (r.effectiveTo ?? "9999-12-31") > input.effectiveFrom);
  if (overlapping.length) throw new CostInputError("Another handling rule covers part of these dates. End it first (handling rules cannot overlap).");
  const [r] = await db.insert(schema.handlingRule).values({ storeId, ...input, currency: st.currency }).returning();
  await audit(db, scope, storeId, "handling_rule.create", "handling_rule", r!.id, null, r);
  return { affectedOrderIds: await ordersInRanges(db, storeId, [input]) };
}

export async function deleteHandlingRule(db: Database, scope: OrgScope, storeId: string, ruleId: string): Promise<ChangeResult> {
  await storeFor(db, scope, storeId, true);
  const [before] = await db.select().from(schema.handlingRule).where(and(eq(schema.handlingRule.id, ruleId), eq(schema.handlingRule.storeId, storeId)));
  if (!before) throw new TenantAccessError("rule not found");
  await db.delete(schema.handlingRule).where(eq(schema.handlingRule.id, ruleId));
  await audit(db, scope, storeId, "handling_rule.delete", "handling_rule", ruleId, before, null);
  return { affectedOrderIds: await ordersInRanges(db, storeId, [before]) };
}

// =============================================================================================== transaction fees

export const gatewayRuleSchema = z
  .object({
    gateway: z.string().trim().min(1).max(100),
    percentRate: percent,
    fixedFee: amount,
    thirdPartyFeeApplies: z.boolean(),
    effectiveFrom: localDate,
    effectiveTo: optionalDate,
  })
  .refine(dateRangeOk, RANGE_MSG);

/** Gateways seen in the store's transactions with how their fees are currently known. */
export async function gatewaySummary(db: Database, scope: OrgScope, storeId: string) {
  await storeFor(db, scope, storeId, false);
  const res = await db.execute(sql`
    select coalesce(gateway, 'unknown') as gateway, bool_or(manual_payment_gateway) as manual,
      count(*) filter (where kind in ('SALE', 'CAPTURE') and status = 'SUCCESS')::int as payments,
      count(*) filter (where kind in ('SALE', 'CAPTURE') and status = 'SUCCESS' and fee_amount is not null)::int as with_actual_fees,
      coalesce(sum(amount) filter (where kind in ('SALE', 'CAPTURE') and status = 'SUCCESS'), 0)::text as volume,
      coalesce(sum(fee_amount) filter (where kind in ('SALE', 'CAPTURE') and status = 'SUCCESS'), 0)::text as actual_fees,
      -- Fee rate over the payments that report fees (null when none do).
      (sum(fee_amount) filter (where kind in ('SALE', 'CAPTURE') and status = 'SUCCESS' and fee_amount is not null)
        / nullif(sum(amount) filter (where kind in ('SALE', 'CAPTURE') and status = 'SUCCESS' and fee_amount is not null), 0))::text as effective_rate
    from payment_transaction where store_id = ${storeId}
    group by 1 order by 3 desc`);
  return res.rows as { gateway: string; manual: boolean; payments: number; with_actual_fees: number; volume: string; actual_fees: string; effective_rate: string | null }[];
}

export async function feeSettings(db: Database, scope: OrgScope, storeId: string): Promise<{ thirdPartyFeeRate: string | null; plan: string | null }> {
  const st = await storeFor(db, scope, storeId, false);
  return { thirdPartyFeeRate: st.thirdPartyFeeRate, plan: st.shopifyPlan };
}

export async function listGatewayRules(db: Database, scope: OrgScope, storeId: string) {
  await storeFor(db, scope, storeId, false);
  return db.select().from(schema.gatewayFeeRule).where(eq(schema.gatewayFeeRule.storeId, storeId)).orderBy(asc(schema.gatewayFeeRule.gateway), desc(schema.gatewayFeeRule.effectiveFrom));
}

export async function saveGatewayRule(db: Database, scope: OrgScope, storeId: string, raw: z.input<typeof gatewayRuleSchema>): Promise<ChangeResult> {
  const input = gatewayRuleSchema.parse(raw);
  const st = await storeFor(db, scope, storeId, true);
  const clash = (await listGatewayRules(db, scope, storeId)).some(
    (r) => r.gateway.toLowerCase() === input.gateway.toLowerCase() && r.effectiveFrom < (input.effectiveTo ?? "9999-12-31") && (r.effectiveTo ?? "9999-12-31") > input.effectiveFrom,
  );
  if (clash) throw new CostInputError(`A rule for ${input.gateway} already covers part of these dates. End it first.`);
  const [r] = await db.insert(schema.gatewayFeeRule).values({ storeId, ...input, currency: st.currency }).returning();
  await audit(db, scope, storeId, "gateway_rule.create", "gateway_fee_rule", r!.id, null, r);
  return { affectedOrderIds: await ordersWithGateway(db, storeId, input.gateway) };
}

export async function deleteGatewayRule(db: Database, scope: OrgScope, storeId: string, ruleId: string): Promise<ChangeResult> {
  await storeFor(db, scope, storeId, true);
  const [before] = await db.select().from(schema.gatewayFeeRule).where(and(eq(schema.gatewayFeeRule.id, ruleId), eq(schema.gatewayFeeRule.storeId, storeId)));
  if (!before) throw new TenantAccessError("rule not found");
  await db.delete(schema.gatewayFeeRule).where(eq(schema.gatewayFeeRule.id, ruleId));
  await audit(db, scope, storeId, "gateway_rule.delete", "gateway_fee_rule", ruleId, before, null);
  return { affectedOrderIds: await ordersWithGateway(db, storeId, before.gateway) };
}

async function ordersWithGateway(db: Database, storeId: string, gateway: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: schema.paymentTransaction.orderId })
    .from(schema.paymentTransaction)
    .where(and(eq(schema.paymentTransaction.storeId, storeId), ilike(schema.paymentTransaction.gateway, gateway.replace(/[\\%_]/g, (c) => `\\${c}`))));
  return rows.map((r) => r.id);
}

/** Shopify's fee on third-party gateways (percent, depends on the plan); null = unknown. */
export async function setThirdPartyFeeRate(db: Database, scope: OrgScope, storeId: string, rate: string | null): Promise<ChangeResult> {
  const parsed = percent.nullable().parse(rate === "" ? null : rate);
  const st = await storeFor(db, scope, storeId, true);
  await db.update(schema.store).set({ thirdPartyFeeRate: parsed }).where(eq(schema.store.id, storeId));
  await audit(db, scope, storeId, "store.third_party_fee_rate", "store", storeId, { rate: st.thirdPartyFeeRate }, { rate: parsed });
  const rows = await db
    .selectDistinct({ id: schema.paymentTransaction.orderId })
    .from(schema.paymentTransaction)
    .where(and(eq(schema.paymentTransaction.storeId, storeId), sql`coalesce(${schema.paymentTransaction.gateway}, '') <> 'shopify_payments'`, eq(schema.paymentTransaction.manualPaymentGateway, false)));
  return { affectedOrderIds: rows.map((r) => r.id) };
}

// =============================================================================================== expenses

export const expenseSchema = z
  .object({
    name: z.string().trim().min(1, "Give the expense a name.").max(120),
    categoryId: z.uuid().nullable().default(null),
    type: z.enum(["one_time", "recurring", "per_order", "percent_of_revenue", "percent_of_net_sales", "percent_of_ad_spend"]),
    frequency: z.enum(["daily", "weekly", "monthly"]).nullable().default(null),
    allocation: z.enum(["spread", "on_date"]).default("spread"),
    amount: amount.nullable().default(null),
    percent: percent.nullable().default(null),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code."),
    startDate: localDate,
    endDate: optionalDate,
    isAdSpend: z.boolean().default(false),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .refine((e) => (e.type.startsWith("percent_") ? e.percent !== null : e.amount !== null), { message: "Enter the amount (or percentage) of the expense.", path: ["amount"] })
  .refine((e) => e.type !== "recurring" || e.frequency !== null, { message: "Choose how often it recurs.", path: ["frequency"] })
  .refine((e) => e.endDate === null || e.endDate >= e.startDate, { message: "The end date cannot be before the start date.", path: ["endDate"] });
export type ExpenseFormInput = z.input<typeof expenseSchema>;

export async function listExpenses(db: Database, scope: OrgScope, storeId: string) {
  await storeFor(db, scope, storeId, false);
  return db
    .select({ e: schema.expense, category: schema.expenseCategory.name, isMarketing: schema.expenseCategory.isMarketing })
    .from(schema.expense)
    .leftJoin(schema.expenseCategory, eq(schema.expenseCategory.id, schema.expense.categoryId))
    .where(and(eq(schema.expense.storeId, storeId), eq(schema.expense.organizationId, scope.organizationId), isNull(schema.expense.archivedAt)))
    .orderBy(desc(schema.expense.startDate), asc(schema.expense.name));
}

export async function listExpenseCategories(db: Database, scope: OrgScope) {
  return db.select().from(schema.expenseCategory).where(eq(schema.expenseCategory.organizationId, scope.organizationId)).orderBy(asc(schema.expenseCategory.name));
}

export async function createExpenseCategory(db: Database, scope: OrgScope, name: string, isMarketing: boolean) {
  assertRole(scope, "editor");
  const n = z.string().trim().min(1).max(60).parse(name);
  const [c] = await db
    .insert(schema.expenseCategory)
    .values({ organizationId: scope.organizationId, name: n, isMarketing })
    .onConflictDoUpdate({ target: [schema.expenseCategory.organizationId, schema.expenseCategory.name], set: { isMarketing } })
    .returning();
  return c!;
}

/** Expenses are applied when reports are read (D-034), so saving one needs no recalculation. */
export async function saveExpense(db: Database, scope: OrgScope, storeId: string, expenseId: string | null, raw: ExpenseFormInput): Promise<ChangeResult> {
  const input = expenseSchema.parse(raw);
  await storeFor(db, scope, storeId, true);
  if (input.categoryId) {
    const [c] = await db.select().from(schema.expenseCategory).where(and(eq(schema.expenseCategory.id, input.categoryId), eq(schema.expenseCategory.organizationId, scope.organizationId)));
    if (!c) throw new TenantAccessError("category not found");
  }
  const values = {
    ...input,
    frequency: input.type === "recurring" ? input.frequency : null,
    amount: input.type.startsWith("percent_") ? null : input.amount,
    percent: input.type.startsWith("percent_") ? input.percent : null,
  };
  if (expenseId) {
    const [before] = await db.select().from(schema.expense).where(and(eq(schema.expense.id, expenseId), eq(schema.expense.storeId, storeId), eq(schema.expense.organizationId, scope.organizationId)));
    if (!before) throw new TenantAccessError("expense not found");
    await db.update(schema.expense).set(values).where(eq(schema.expense.id, expenseId));
    await audit(db, scope, storeId, "expense.update", "expense", expenseId, before, values);
  } else {
    const [e] = await db.insert(schema.expense).values({ organizationId: scope.organizationId, storeId, ...values }).returning({ id: schema.expense.id });
    await audit(db, scope, storeId, "expense.create", "expense", e!.id, null, values);
  }
  return { affectedOrderIds: [] };
}

export async function archiveExpense(db: Database, scope: OrgScope, storeId: string, expenseId: string): Promise<ChangeResult> {
  await storeFor(db, scope, storeId, true);
  const [before] = await db.select().from(schema.expense).where(and(eq(schema.expense.id, expenseId), eq(schema.expense.storeId, storeId), eq(schema.expense.organizationId, scope.organizationId)));
  if (!before) throw new TenantAccessError("expense not found");
  await db.update(schema.expense).set({ archivedAt: new Date() }).where(eq(schema.expense.id, expenseId));
  await audit(db, scope, storeId, "expense.archive", "expense", expenseId, before, null);
  return { affectedOrderIds: [] };
}

// =============================================================================================== policy

export async function getPolicy(db: Database, scope: OrgScope, storeId: string) {
  await storeFor(db, scope, storeId, false);
  const active = await loadActivePolicy(db, storeId);
  const history = await db
    .select({ version: schema.financialPolicy.version, createdAt: schema.financialPolicy.createdAt, userName: schema.user.name })
    .from(schema.financialPolicy)
    .leftJoin(schema.user, eq(schema.user.id, schema.financialPolicy.createdByUserId))
    .where(eq(schema.financialPolicy.storeId, storeId))
    .orderBy(desc(schema.financialPolicy.version));
  return { ...active, history };
}

/** Saves a new policy version (never edits an old one) and asks for a full store recalculation. */
export async function savePolicy(db: Database, scope: OrgScope, storeId: string, raw: unknown): Promise<ChangeResult & { version: number }> {
  assertRole(scope, "admin");
  const policy = financialPolicySchema.parse(raw);
  await storeFor(db, scope, storeId, true);
  const before = await loadActivePolicy(db, storeId);
  if (JSON.stringify(before.policy) === JSON.stringify(policy)) return { affectedOrderIds: [], version: before.version };
  const version = before.version + 1;
  await db.insert(schema.financialPolicy).values({ storeId, version, settings: policy as unknown as Record<string, unknown>, createdByUserId: scope.userId });
  await audit(db, scope, storeId, "policy.update", "financial_policy", String(version), before.policy, policy);
  return { affectedOrderIds: [], wholeStore: true, version };
}

// =============================================================================================== recalculation

export interface RecalcSender {
  send(name: string, data?: object | null, options?: { singletonKey?: string }): Promise<string | null>;
}

/**
 * Applies a change's recalculation: inline when small (the user sees updated numbers immediately),
 * otherwise as a background store recalculation. Returns how it was handled for the UI message.
 */
export async function applyRecalc(profit: ProfitService, jobs: RecalcSender | null, storeId: string, change: ChangeResult): Promise<{ mode: "none" | "inline" | "queued"; orders: number }> {
  if (!change.wholeStore && change.affectedOrderIds.length === 0) return { mode: "none", orders: 0 };
  if (!change.wholeStore && change.affectedOrderIds.length <= INLINE_RECALC_LIMIT) {
    const r = await profit.recalcOrders(storeId, change.affectedOrderIds);
    return { mode: "inline", orders: r.computed };
  }
  const n = await profit.orderCount(storeId);
  if (jobs && n > INLINE_RECALC_LIMIT) {
    await jobs.send(QUEUES.recalcStore, { storeId }, { singletonKey: storeId });
    return { mode: "queued", orders: n };
  }
  const r = await profit.recalcStore(storeId);
  return { mode: "inline", orders: r.computed };
}

