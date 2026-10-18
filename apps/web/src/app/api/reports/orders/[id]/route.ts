import { z } from "zod";
import { engineNotReady, json, jsonError } from "@/server/api";
import { reportingFor } from "@/server/reporting";
import { getAppSession } from "@/server/session";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession();
  if (!session) return jsonError(401, "Not signed in");
  const store = z.string().min(1).max(64).safeParse(new URL(request.url).searchParams.get("store"));
  if (!store.success) return jsonError(400, "store is required");
  const reporting = await reportingFor(session.scope, store.data);
  if (!reporting) return jsonError(404, "Store not found");
  if (reporting.kind === "engine_pending") return engineNotReady(reporting.store.name);
  const { id } = await params;
  const order = await reporting.source.getOrder(store.data, id);
  return order ? json(order) : jsonError(404, "Order not found");
}
