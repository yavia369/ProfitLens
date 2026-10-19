import { addDays, daysBetweenInclusive, dec, Decimal, isLocalDate, toMoneyString } from "@profitlens/finance";
import { assertRole, assertStoresInScope, schema, TenantAccessError, type Database, type OrgScope } from "@profitlens/db";
import { and, asc, between, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { CostInputError } from "../profit/costs";

export const MANUAL_PLATFORMS = ["google_ads", "meta", "tiktok", "manual"] as const;
export type ManualPlatform = (typeof MANUAL_PLATFORMS)[number];

const localDate = z.string().refine(isLocalDate, "Enter a date as YYYY-MM-DD.");

export const manualSpendSchema = z
  .object({
    platform: z.enum(MANUAL_PLATFORMS),
    /** First day; with `to`, the amount is spread evenly over the days (e.g. a monthly invoice). */
    from: localDate,
    to: z.union([localDate, z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null),
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,12}(\.\d{1,6})?$/, "Enter an amount like 120.50 (no currency symbol)."),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code."),
    note: z.string().trim().max(300).nullable().default(null),
    /** Correction on top of API-imported spend for the same platform and dates. */
    adjustment: z.boolean().default(false),
  })
  .refine((v) => v.to === null || v.to >= v.from, { message: "The end date cannot be before the start date.", path: ["to"] })
  .refine((v) => v.to === null || daysBetweenInclusive({ start: v.from, end: v.to }) <= 366, { message: "Spread an amount over at most one year.", path: ["to"] });
export type ManualSpendInput = z.input<typeof manualSpendSchema>;

/** Spreads an amount over days exactly: equal 6-dp shares, the remainder on the last day (Σ = amount). */
export function spreadAmount(amount: string, days: number): string[] {
  const total = dec(amount);
  const share = total.div(days).toDecimalPlaces(6, Decimal.ROUND_DOWN);
  const out = Array.from({ length: days }, () => toMoneyString(share));
  out[days - 1] = toMoneyString(total.minus(share.times(days - 1)));
  return out;
}

async function storeFor(db: Database, scope: OrgScope, storeId: string) {
  await assertStoresInScope(db, scope, [storeId]);
  const [st] = await db.select().from(schema.store).where(eq(schema.store.id, storeId));
  if (!st || st.isDemo) throw new TenantAccessError("ad spend can only be entered for connected stores");
  return st;
}

/**
 * Records manual ad spend (FINANCIAL_MODEL §5.6). Entering a day again replaces that day's manual amount for the
 * platform. Spend for a platform whose API data is already imported for those dates is rejected unless it is
 * marked as an adjustment (double-counting guard).
 */
export async function saveManualSpend(db: Database, scope: OrgScope, storeId: string, raw: ManualSpendInput): Promise<{ days: number }> {
  assertRole(scope, "editor");
  const input = manualSpendSchema.parse(raw);
  const st = await storeFor(db, scope, storeId);
  const to = input.to ?? input.from;
  if (!input.adjustment) {
    const [api] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.adSpendDaily)
      .innerJoin(schema.adAccount, eq(schema.adAccount.id, schema.adSpendDaily.adAccountId))
      .where(and(eq(schema.adAccount.storeId, storeId), eq(schema.adAccount.platform, input.platform), eq(schema.adSpendDaily.source, "api"), between(schema.adSpendDaily.date, input.from, to)));
    if ((api?.n ?? 0) > 0) {
      throw new CostInputError("Spend for this platform and these dates is already imported from its API. Enter it as an adjustment if you are correcting it.");
    }
  }
  const externalId = `manual:${storeId}:${input.platform}:${input.currency}`;
  const [acct] = await db
    .insert(schema.adAccount)
    .values({ organizationId: scope.organizationId, platform: input.platform, externalId, name: "Manual entries", currency: input.currency, timezone: st.ianaTimezone, storeId })
    .onConflictDoUpdate({ target: [schema.adAccount.organizationId, schema.adAccount.platform, schema.adAccount.externalId], set: { storeId, timezone: st.ianaTimezone, updatedAt: new Date() } })
    .returning({ id: schema.adAccount.id });
  const n = daysBetweenInclusive({ start: input.from, end: to });
  const amounts = spreadAmount(input.amount, n);
  const entity = input.adjustment ? "adjustment" : "manual";
  await db.transaction(async (tx) => {
    for (let i = 0; i < n; i++) {
      const values = {
        adAccountId: acct!.id,
        level: "account" as const,
        entityExternalId: entity,
        date: addDays(input.from, i),
        source: "manual" as const,
        spend: amounts[i]!,
        note: input.note,
        isAdjustment: input.adjustment,
        enteredByUserId: scope.userId,
      };
      await tx
        .insert(schema.adSpendDaily)
        .values(values)
        .onConflictDoUpdate({
          target: [schema.adSpendDaily.adAccountId, schema.adSpendDaily.level, schema.adSpendDaily.entityExternalId, schema.adSpendDaily.date, schema.adSpendDaily.source],
          set: { spend: values.spend, note: values.note, enteredByUserId: scope.userId, updatedAt: new Date() },
        });
    }
    await tx.insert(schema.auditLog).values({ organizationId: scope.organizationId, storeId, actorUserId: scope.userId, action: "ad_spend.manual", entityType: "ad_account", entityId: acct!.id, after: input });
  });
  return { days: n };
}

export interface ManualSpendRow {
  readonly id: string;
  readonly platform: string;
  readonly date: string;
  readonly spend: string;
  readonly currency: string;
  readonly isAdjustment: boolean;
  readonly note: string | null;
}

export async function listManualSpend(db: Database, scope: OrgScope, storeId: string, limit = 200): Promise<ManualSpendRow[]> {
  await storeFor(db, scope, storeId);
  const rows = await db
    .select({ d: schema.adSpendDaily, platform: schema.adAccount.platform, currency: schema.adAccount.currency })
    .from(schema.adSpendDaily)
    .innerJoin(schema.adAccount, eq(schema.adAccount.id, schema.adSpendDaily.adAccountId))
    .where(and(eq(schema.adAccount.organizationId, scope.organizationId), eq(schema.adAccount.storeId, storeId), eq(schema.adSpendDaily.source, "manual")))
    .orderBy(desc(schema.adSpendDaily.date), asc(schema.adAccount.platform))
    .limit(limit);
  return rows.map(({ d, platform, currency }) => ({ id: d.id, platform, date: d.date, spend: d.spend, currency, isAdjustment: d.isAdjustment, note: d.note }));
}

export async function deleteManualSpend(db: Database, scope: OrgScope, storeId: string, ids: readonly string[]): Promise<number> {
  assertRole(scope, "editor");
  await storeFor(db, scope, storeId);
  if (ids.length === 0) return 0;
  const owned = await db
    .select({ id: schema.adSpendDaily.id })
    .from(schema.adSpendDaily)
    .innerJoin(schema.adAccount, eq(schema.adAccount.id, schema.adSpendDaily.adAccountId))
    .where(and(inArray(schema.adSpendDaily.id, [...ids]), eq(schema.adAccount.storeId, storeId), eq(schema.adAccount.organizationId, scope.organizationId), eq(schema.adSpendDaily.source, "manual")));
  if (owned.length !== new Set(ids).size) throw new TenantAccessError("ad spend entry not found");
  await db.delete(schema.adSpendDaily).where(inArray(schema.adSpendDaily.id, owned.map((o) => o.id)));
  await db.insert(schema.auditLog).values({ organizationId: scope.organizationId, storeId, actorUserId: scope.userId, action: "ad_spend.manual_delete", entityType: "ad_spend_daily", entityId: null, before: { ids } });
  return owned.length;
}

/** Ad accounts of the organization (for the connection/mapping UI), managers last. */
export async function listAdAccounts(db: Database, scope: OrgScope) {
  return db
    .select({ a: schema.adAccount, storeName: schema.store.name })
    .from(schema.adAccount)
    .leftJoin(schema.store, eq(schema.store.id, schema.adAccount.storeId))
    .where(and(eq(schema.adAccount.organizationId, scope.organizationId), isNotNull(schema.adAccount.connectionId)))
    .orderBy(asc(schema.adAccount.isManager), asc(schema.adAccount.name));
}

export async function listAdConnections(db: Database, scope: OrgScope) {
  return db
    .select({ id: schema.adConnection.id, platform: schema.adConnection.platform, displayName: schema.adConnection.displayName, status: schema.adConnection.status, lastError: schema.adConnection.lastError, loginCustomerId: schema.adConnection.loginCustomerId })
    .from(schema.adConnection)
    .where(eq(schema.adConnection.organizationId, scope.organizationId));
}
