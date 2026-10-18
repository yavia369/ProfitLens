import { handleShopifyWebhook } from "@profitlens/core/shopify";
import { NextResponse } from "next/server";
import { jobs, shopifyDeps } from "@/server/shopify";

/** Shopify webhook receiver: verify, dedupe, enqueue — never trust payload contents (ARCHITECTURE §4). */
export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > 5 * 1024 * 1024) return new NextResponse(null, { status: 413 });
  const { db, keyring } = shopifyDeps();
  const result = await handleShopifyWebhook({ db, keyring, jobs: jobs() }, raw, (name) => request.headers.get(name));
  return NextResponse.json({ ok: result.status === 200, outcome: result.outcome }, { status: result.status });
}
