import { exportCostsCsv } from "@profitlens/core/profit";
import { TenantAccessError } from "@profitlens/db";
import { z } from "zod";
import { jsonError } from "@/server/api";
import { db } from "@/server/db";
import { getAppSession } from "@/server/session";

/** Current product costs of a store as CSV (re-importable on the Product costs page). */
export async function GET(request: Request) {
  const session = await getAppSession();
  if (!session) return jsonError(401, "Not signed in");
  const store = z.uuid().safeParse(new URL(request.url).searchParams.get("store"));
  if (!store.success) return jsonError(400, "store is required");
  try {
    const csv = await exportCostsCsv(db(), session.scope, store.data);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="product-costs-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof TenantAccessError) return jsonError(404, "Store not found");
    throw e;
  }
}
