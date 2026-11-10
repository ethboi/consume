// GET /api/ledger : every feeding, every $CONSUME minted and every $CONSUME
// burned, newest first, each with its transaction. Read from the contract's
// own event logs through a public indexer (see src/lib/ledger.ts), kept for
// half a minute.

import { DEMO_LEDGER } from "@/lib/demo";
import { readLedger, type Ledger } from "@/lib/ledger";
import { CONSUME_CONTRACT, DEMO, NETWORK, view, type VestView } from "@/lib/near";

export const dynamic = "force-dynamic";

const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" };

export async function GET() {
  if (DEMO) return Response.json(DEMO_LEDGER satisfies Ledger, { headers });
  try {
    // whoever holds a Bond now, so that what they collected is found
    const holders = await view<VestView[]>(CONSUME_CONTRACT, "get_recent_vests", { limit: 100 })
      .then((vests) => [...new Set(vests.map((v) => v.owner_id))])
      .catch(() => []);
    return Response.json(await readLedger({ network: NETWORK, consume: CONSUME_CONTRACT }, holders), { headers });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  }
}
