import { json, jsonError } from "@/server/api";
import { listAccessibleStores } from "@/server/reporting";
import { getAppSession } from "@/server/session";

export async function GET() {
  const session = await getAppSession();
  if (!session) return jsonError(401, "Not signed in");
  return json({ stores: await listAccessibleStores(session.scope) });
}
