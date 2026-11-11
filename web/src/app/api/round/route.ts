// GET /api/round : the newest price round the Assayer posted, with the quotes
// it wrote into the same transaction (see src/lib/round.ts). Read through a
// public indexer, kept for half a minute. The sample figures have no Assayer
// and so no round.

import { CONSUME_CONTRACT, DEMO, NETWORK, view, type Config } from "@/lib/near";
import { latestRound, type Round } from "@/lib/round";

export const dynamic = "force-dynamic";

const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" };

export type RoundAnswer = { feeder: string | null; round: Round | null };

export async function GET() {
  if (DEMO) return Response.json({ feeder: null, round: null } satisfies RoundAnswer, { headers });
  try {
    const feeder = (await view<Config>(CONSUME_CONTRACT, "get_config")).price_feeder_id ?? null;
    const round = feeder ? await latestRound({ network: NETWORK, consume: CONSUME_CONTRACT }, feeder) : null;
    return Response.json({ feeder, round } satisfies RoundAnswer, { headers });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  }
}
