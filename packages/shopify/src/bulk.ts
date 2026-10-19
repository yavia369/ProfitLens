import type { AdminClient } from "./client";
import { ShopifyError } from "./errors";
import { BULK_RUN_MUTATION, BULK_STATUS_QUERY } from "./queries";
import type { RawOrder, RawProduct } from "./types";

export interface BulkOperationStatus {
  id: string;
  status: "CREATED" | "RUNNING" | "COMPLETED" | "CANCELING" | "CANCELED" | "FAILED" | "EXPIRED";
  errorCode: string | null;
  objectCount: string;
  rootObjectCount: string;
  url: string | null;
  partialDataUrl: string | null;
}

export async function startBulkQuery(client: AdminClient, query: string): Promise<string> {
  const { data } = await client.request<{
    bulkOperationRunQuery: { bulkOperation: { id: string; status: string } | null; userErrors: { field: string[] | null; message: string; code: string | null }[] };
  }>(BULK_RUN_MUTATION, { query }, 10);
  const r = data.bulkOperationRunQuery;
  if (r.userErrors.length || !r.bulkOperation) {
    throw new ShopifyError(`Bulk operation rejected: ${r.userErrors.map((e) => e.message).join("; ")}`, "user", 200, r.userErrors);
  }
  return r.bulkOperation.id;
}

export async function getBulkStatus(client: AdminClient, id: string): Promise<BulkOperationStatus> {
  const { data } = await client.request<{ node: BulkOperationStatus | null }>(BULK_STATUS_QUERY, { id }, 2);
  if (!data.node) throw new ShopifyError(`Bulk operation ${id} not found`, "graphql");
  return data.node;
}

/** Polls until the operation finishes (with a growing interval capped at 30 s). */
export async function waitForBulk(
  client: AdminClient,
  id: string,
  opts: { sleep?: (ms: number) => Promise<void>; timeoutMs?: number; onProgress?: (s: BulkOperationStatus) => void } = {},
): Promise<BulkOperationStatus> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (opts.timeoutMs ?? 6 * 60 * 60_000);
  for (let delay = 1000; ; delay = Math.min(delay * 1.5, 30_000)) {
    const s = await getBulkStatus(client, id);
    opts.onProgress?.(s);
    if (s.status === "COMPLETED") return s;
    if (s.status === "FAILED" || s.status === "CANCELED" || s.status === "EXPIRED") {
      throw new ShopifyError(`Bulk operation ${s.status.toLowerCase()}${s.errorCode ? ` (${s.errorCode})` : ""}`, "server", undefined, s);
    }
    if (Date.now() > deadline) throw new ShopifyError("Bulk operation timed out", "server", undefined, s);
    await sleep(delay);
  }
}

type JsonObject = Record<string, unknown> & { id?: string; __parentId?: string };

/** Which array on the parent a child GID belongs to (bulk JSONL nests connections via __parentId). */
function childSlot(childId: string, parentId: string): string | null {
  const type = /^gid:\/\/shopify\/([A-Za-z]+)\//.exec(childId)?.[1];
  const parentType = /^gid:\/\/shopify\/([A-Za-z]+)\//.exec(parentId)?.[1];
  if (!type) return null;
  if (parentType === "Order") {
    if (type === "LineItem") return "lineItems";
    if (type.endsWith("Agreement") || type === "SalesAgreement") return "agreements";
  }
  if (parentType && parentType.endsWith("Agreement") && type.endsWith("Sale")) return "sales";
  if (parentType === "Product" && type === "ProductVariant") return "variants";
  return null;
}

/**
 * Reassembles bulk JSONL into nested objects. Root objects (no __parentId) are yielded once all lines
 * are read; children are attached to their parent arrays. Refunds are inline lists on the order and come
 * without refundLineItems (bulk can't select a connection inside a list), so refunded orders need a refetch.
 */
export function assembleBulkJsonl<T>(lines: Iterable<string>): T[] {
  const roots: JsonObject[] = [];
  const byId = new Map<string, JsonObject>();
  const index = (obj: JsonObject) => {
    if (typeof obj.id === "string") byId.set(obj.id, obj);
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) for (const item of v) if (item && typeof item === "object") index(item as JsonObject);
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const obj = JSON.parse(line) as JsonObject;
    const parentId = obj.__parentId;
    delete obj.__parentId;
    if (!parentId) {
      roots.push(obj);
      index(obj);
      continue;
    }
    const parent = byId.get(parentId);
    const slot = typeof obj.id === "string" ? childSlot(obj.id, parentId) : null;
    if (!parent || !slot) throw new ShopifyError(`Unexpected bulk line (parent ${parentId}, id ${String(obj.id)})`, "graphql");
    const arr = (parent[slot] as unknown[] | undefined) ?? [];
    arr.push(obj);
    parent[slot] = arr;
    index(obj);
  }
  // Ensure connection slots exist even when empty.
  for (const r of roots) {
    if (typeof r.id === "string" && r.id.includes("/Order/")) {
      r.lineItems ??= [];
      r.agreements ??= [];
      for (const a of r.agreements as JsonObject[]) a.sales ??= [];
    }
    if (typeof r.id === "string" && r.id.includes("/Product/")) r.variants ??= [];
  }
  return roots as T[];
}

export type BulkOrders = RawOrder[];
export type BulkProducts = RawProduct[];

/** Downloads a bulk result file and returns its lines (results are typically a few MB per thousand orders). */
export async function downloadJsonl(url: string, fetchImpl: (u: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }> = fetch): Promise<string[]> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new ShopifyError(`Failed to download bulk results (${res.status})`, res.status >= 500 ? "server" : "graphql", res.status);
  return (await res.text()).split("\n");
}
