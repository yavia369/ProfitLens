import { json, jsonError } from "@/server/api";
import { storeComparisonFor } from "@/server/comparison";
import { getAppSession } from "@/server/session";

export async function GET(request: Request) {
  const session = await getAppSession();
  if (!session) return jsonError(401, "Not signed in");
  const r = await storeComparisonFor(session, new URL(request.url).searchParams);
  return "error" in r ? jsonError(r.status, r.error) : json(r);
}
