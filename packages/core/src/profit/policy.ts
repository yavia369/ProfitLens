import { DEFAULT_POLICY, type FinancialPolicy } from "@profitlens/finance";
import { schema, type Database } from "@profitlens/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

const moneyString = z.string().regex(/^\d+(\.\d{1,6})?$/, "a non-negative amount like 12.50");

/** Validates a stored or submitted policy (FINANCIAL_MODEL §7). */
export const financialPolicySchema = z.object({
  includedFinancialStatuses: z.array(z.enum(["PENDING", "AUTHORIZED", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "VOIDED", "EXPIRED"])).min(1),
  tipsAsRevenue: z.boolean(),
  dutiesAndFeesAsRevenue: z.boolean(),
  refundDating: z.enum(["event", "order"]),
  chargebackDating: z.enum(["event", "order"]),
  cogsFallback: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("none") }),
    z.object({ mode: z.literal("percent_of_price"), percent: z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "a percentage between 0 and 99.99") }),
  ]),
  cogsReversalRestockTypes: z.array(z.enum(["RETURN", "CANCEL", "NO_RESTOCK", "LEGACY_RESTOCK"])),
  zeroShippingIfUnfulfilledCancel: z.boolean(),
  feeTaxRecoverable: z.boolean(),
  feesRefundedOnRefund: z.boolean(),
  defaultChargebackFee: moneyString.nullable(),
  expenseAllocation: z.enum(["spread", "on_date"]),
}) satisfies z.ZodType<FinancialPolicy>;

export interface ActivePolicy {
  readonly version: number;
  readonly policy: FinancialPolicy;
}

/** The newest policy version of a store (version 0 = defaults, when none was ever saved). */
export async function loadActivePolicy(db: Database, storeId: string): Promise<ActivePolicy> {
  const [row] = await db
    .select({ version: schema.financialPolicy.version, settings: schema.financialPolicy.settings })
    .from(schema.financialPolicy)
    .where(eq(schema.financialPolicy.storeId, storeId))
    .orderBy(desc(schema.financialPolicy.version))
    .limit(1);
  if (!row) return { version: 0, policy: DEFAULT_POLICY };
  // Settings saved by older versions may lack newer keys: defaults fill the gaps.
  return { version: row.version, policy: financialPolicySchema.parse({ ...DEFAULT_POLICY, ...row.settings }) };
}
