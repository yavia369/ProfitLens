"use server";

import {
  applyCostImport,
  applyRecalc,
  archiveExpense,
  CostInputError,
  createExpenseCategory,
  deleteCostVersion,
  deleteGatewayRule,
  deleteHandlingRule,
  deleteShippingRule,
  previewCostImport,
  ProfitService,
  saveExpense,
  saveGatewayRule,
  saveHandlingRule,
  savePolicy,
  saveShippingRule,
  setThirdPartyFeeRate,
  setVariantCost,
  variantCostHistory,
  variantIdsOfProduct,
  type ChangeResult,
  type CostImportPreview,
  type ExpenseFormInput,
  type ShippingRuleFormInput,
} from "@profitlens/core/profit";
import { TenantAccessError, type Database, type OrgScope } from "@profitlens/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";
import { jobs } from "@/server/shopify";

export interface ActionState {
  ok: boolean;
  message: string;
}

/** "All history" for costs: before any possible order. */
const ALL_HISTORY = "2000-01-01";

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};
const bool = (form: FormData, key: string) => form.get(key) === "on" || form.get(key) === "true";

function errorMessage(e: unknown): string | null {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? "Some values are invalid.";
  if (e instanceof CostInputError || e instanceof TenantAccessError) return e.message;
  return null;
}

/**
 * Runs a cost change for the signed-in user's organization, then recalculates what it affects (inline when
 * small, otherwise in the background) and refreshes cost pages and reports.
 */
async function change(storeId: string, fn: (db: Database, scope: OrgScope) => Promise<ChangeResult>, saved: string): Promise<ActionState> {
  const session = await requireAppSession();
  try {
    const result = await fn(db(), session.scope);
    // Lazy sender: only connects to the queue when a change is too large to recalculate inline.
    const recalc = await applyRecalc(new ProfitService(db()), { send: (...a) => jobs().send(...a) }, storeId, result);
    revalidatePath("/", "layout");
    const tail =
      recalc.mode === "inline" ? ` Recalculated ${recalc.orders} order${recalc.orders === 1 ? "" : "s"}.` : recalc.mode === "queued" ? ` Recalculating ${recalc.orders.toLocaleString("en")} orders in the background.` : "";
    return { ok: true, message: `${saved}${tail}` };
  } catch (e) {
    const msg = errorMessage(e);
    if (msg) return { ok: false, message: msg };
    console.error("cost action failed", e);
    return { ok: false, message: "Unexpected error. Nothing was changed." };
  }
}

// ---------------------------------------------------------------- product costs

export async function setCostAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const storeId = str(form, "storeId");
  return change(
    storeId,
    async (database, scope) => {
      const productId = str(form, "productId");
      const variantIds = bool(form, "applyToProduct") && productId ? await variantIdsOfProduct(database, scope, storeId, productId) : form.getAll("variantId").map(String);
      const effectiveFrom = str(form, "from") === "date" ? str(form, "effectiveFrom") : ALL_HISTORY;
      return setVariantCost(database, scope, storeId, {
        variantIds,
        productCost: str(form, "productCost"),
        inboundShipping: str(form, "inboundShipping") || "0",
        handling: str(form, "handling") || "0",
        effectiveFrom,
        note: str(form, "note") || undefined,
        source: variantIds.length > 1 ? "bulk_edit" : "manual",
      });
    },
    "Cost saved.",
  );
}

export interface CostVersionView {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  productCost: string;
  inboundShipping: string;
  handling: string;
  source: string;
  note: string | null;
}

export async function costHistoryAction(storeId: string, variantId: string): Promise<CostVersionView[]> {
  const session = await requireAppSession();
  const rows = await variantCostHistory(db(), session.scope, storeId, variantId);
  return rows.map((r) => ({
    id: r.id,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    productCost: r.productCost,
    inboundShipping: r.inboundShipping,
    handling: r.handling,
    source: r.source,
    note: r.note,
  }));
}

export async function deleteCostVersionAction(storeId: string, versionId: string): Promise<ActionState> {
  return change(storeId, (database, scope) => deleteCostVersion(database, scope, storeId, versionId), "Cost version deleted.");
}

export async function previewImportAction(storeId: string, csv: string): Promise<{ ok: true; preview: CostImportPreview } | { ok: false; message: string }> {
  const session = await requireAppSession();
  try {
    return { ok: true, preview: await previewCostImport(db(), session.scope, storeId, csv) };
  } catch (e) {
    return { ok: false, message: errorMessage(e) ?? "Could not read the file." };
  }
}

export async function applyImportAction(storeId: string, csv: string): Promise<ActionState> {
  let summary = "";
  const state = await change(
    storeId,
    async (database, scope) => {
      const r = await applyCostImport(database, scope, storeId, csv);
      summary = `Imported ${r.applied} cost${r.applied === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} row${r.skipped === 1 ? "" : "s"} with errors` : ""}.`;
      return r;
    },
    "",
  );
  return state.ok ? { ok: true, message: `${summary}${state.message}` } : state;
}

// ---------------------------------------------------------------- shipping & handling

function shippingParams(form: FormData): ShippingRuleFormInput["params"] {
  switch (str(form, "type")) {
    case "per_item":
      return { type: "per_item", amount: str(form, "amount") };
    case "first_plus_additional":
      return { type: "first_plus_additional", first: str(form, "first"), additional: str(form, "additional") };
    case "tiered_quantity": {
      const amounts = form.getAll("tierAmount").map(String);
      const tiers = form
        .getAll("tierMin")
        .map((min, i) => ({ min: String(min).trim(), amount: (amounts[i] ?? "").trim() }))
        .filter((t) => t.min !== "" || t.amount !== "")
        .map((t) => ({ minQuantity: Number(t.min), amount: t.amount }));
      return { type: "tiered_quantity", tiers };
    }
    default:
      return { type: "per_order", amount: str(form, "amount") };
  }
}

function shippingInput(form: FormData): ShippingRuleFormInput {
  const params = shippingParams(form);
  const countries = str(form, "countries")
    .split(/[\s,]+/)
    .filter(Boolean);
  return {
    name: str(form, "name"),
    params,
    countryCodes: countries.length ? countries : null,
    priority: Number(str(form, "priority") || "100"),
    effectiveFrom: str(form, "effectiveFrom"),
    effectiveTo: str(form, "effectiveTo") || null,
  };
}

export async function saveShippingRuleAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const storeId = str(form, "storeId");
  const ruleId = str(form, "ruleId") || null;
  return change(storeId, (database, scope) => saveShippingRule(database, scope, storeId, ruleId, shippingInput(form)), ruleId ? "Shipping rule updated." : "Shipping rule added.");
}

export async function deleteShippingRuleAction(storeId: string, ruleId: string): Promise<ActionState> {
  return change(storeId, (database, scope) => deleteShippingRule(database, scope, storeId, ruleId), "Shipping rule deleted.");
}

export async function saveHandlingRuleAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const storeId = str(form, "storeId");
  return change(
    storeId,
    (database, scope) =>
      saveHandlingRule(database, scope, storeId, {
        mode: str(form, "mode") as "per_order" | "per_item",
        amount: str(form, "amount"),
        effectiveFrom: str(form, "effectiveFrom"),
        effectiveTo: str(form, "effectiveTo") || null,
      }),
    "Handling rule added.",
  );
}

export async function deleteHandlingRuleAction(storeId: string, ruleId: string): Promise<ActionState> {
  return change(storeId, (database, scope) => deleteHandlingRule(database, scope, storeId, ruleId), "Handling rule deleted.");
}

// ---------------------------------------------------------------- fees

export async function saveGatewayRuleAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const storeId = str(form, "storeId");
  return change(
    storeId,
    (database, scope) =>
      saveGatewayRule(database, scope, storeId, {
        gateway: str(form, "gateway"),
        percentRate: str(form, "percentRate"),
        fixedFee: str(form, "fixedFee") || "0",
        thirdPartyFeeApplies: bool(form, "thirdPartyFeeApplies"),
        effectiveFrom: str(form, "effectiveFrom"),
        effectiveTo: str(form, "effectiveTo") || null,
      }),
    "Fee rule added.",
  );
}

export async function deleteGatewayRuleAction(storeId: string, ruleId: string): Promise<ActionState> {
  return change(storeId, (database, scope) => deleteGatewayRule(database, scope, storeId, ruleId), "Fee rule deleted.");
}

export async function setThirdPartyFeeAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const storeId = str(form, "storeId");
  return change(storeId, (database, scope) => setThirdPartyFeeRate(database, scope, storeId, str(form, "rate").trim() || null), "Third-party fee rate saved.");
}

// ---------------------------------------------------------------- expenses

export async function saveExpenseAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const storeId = str(form, "storeId");
  const expenseId = str(form, "expenseId") || null;
  const type = str(form, "type") as ExpenseFormInput["type"];
  return change(
    storeId,
    async (database, scope) => {
      let categoryId = str(form, "categoryId") || null;
      const newCategory = str(form, "newCategory").trim();
      if (newCategory) categoryId = (await createExpenseCategory(database, scope, newCategory, bool(form, "newCategoryMarketing"))).id;
      return saveExpense(database, scope, storeId, expenseId, {
        name: str(form, "name"),
        categoryId,
        type,
        frequency: type === "recurring" ? (str(form, "frequency") as "daily" | "weekly" | "monthly") : null,
        allocation: (str(form, "allocation") || "spread") as "spread" | "on_date",
        amount: type.startsWith("percent_") ? null : str(form, "amount"),
        percent: type.startsWith("percent_") ? str(form, "amount") : null,
        currency: str(form, "currency"),
        startDate: str(form, "startDate"),
        endDate: str(form, "endDate") || null,
        isAdSpend: bool(form, "isAdSpend"),
        note: str(form, "note") || null,
      });
    },
    expenseId ? "Expense updated." : "Expense added. Reports include it immediately.",
  );
}

export async function archiveExpenseAction(storeId: string, expenseId: string): Promise<ActionState> {
  return change(storeId, (database, scope) => archiveExpense(database, scope, storeId, expenseId), "Expense removed.");
}

// ---------------------------------------------------------------- policy

export async function savePolicyAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const storeId = str(form, "storeId");
  let version = 0;
  const state = await change(
    storeId,
    async (database, scope) => {
      const r = await savePolicy(database, scope, storeId, {
        includedFinancialStatuses: form.getAll("includedFinancialStatuses").map(String),
        tipsAsRevenue: bool(form, "tipsAsRevenue"),
        dutiesAndFeesAsRevenue: bool(form, "dutiesAndFeesAsRevenue"),
        refundDating: str(form, "refundDating"),
        chargebackDating: str(form, "chargebackDating"),
        cogsFallback: str(form, "cogsFallbackMode") === "percent_of_price" ? { mode: "percent_of_price", percent: str(form, "cogsFallbackPercent") } : { mode: "none" },
        cogsReversalRestockTypes: form.getAll("cogsReversalRestockTypes").map(String),
        zeroShippingIfUnfulfilledCancel: bool(form, "zeroShippingIfUnfulfilledCancel"),
        feeTaxRecoverable: bool(form, "feeTaxRecoverable"),
        feesRefundedOnRefund: bool(form, "feesRefundedOnRefund"),
        defaultChargebackFee: str(form, "defaultChargebackFee").trim() || null,
        expenseAllocation: str(form, "expenseAllocation"),
      });
      version = r.version;
      return r;
    },
    "",
  );
  if (!state.ok) return state;
  return { ok: true, message: state.message ? `Saved as version ${version}.${state.message}` : "No changes to save." };
}
