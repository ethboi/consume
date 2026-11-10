// GET /api/routes : asks NEAR Intents (1Click) for a dry quote of $100 of each
// memecoin into USDC on NEAR. A dry quote is free and moves nothing; it shows
// whether the memecoin is routable through Intents right now and what it costs.
// Cached for five minutes so visitors never hammer the 1Click API.

import { HERESIES } from "@/lib/heresies";

const ONECLICK = "https://1click.chaindefuser.com/v0";
const USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const TTL_MS = 5 * 60_000;
// a reading with a shut road is kept for less time: 1Click refuses a quote now
// and then when busy, and that should not stand on the page for five minutes
const SHUT_TTL_MS = 30_000;

export type Route = { symbol: string; chain: string; open: boolean; outUsd: number | null; seconds: number | null };
type Cache = { at: number; routes: Route[] };
let cache: Cache | null = null;

const headers = { "Content-Type": "application/json", "User-Agent": "consume-site" };

async function quote(assetId: string, amount: bigint) {
  const body = {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: assetId,
    depositType: "INTENTS",
    destinationAsset: USDC,
    amount: amount.toString(),
    // a dry quote needs addresses but sends nothing to them
    refundTo: "test.near",
    refundType: "INTENTS",
    recipient: "test.near",
    recipientType: "INTENTS",
    deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
  const res = await fetch(`${ONECLICK}/quote`, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
  const json = await res.json().catch(() => null);
  return json?.quote ?? null;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One quote, asked again once if it is refused. */
async function quoteTwice(assetId: string, amount: bigint) {
  const first = await quote(assetId, amount).catch(() => null);
  if (first) return first;
  await pause(1200);
  return quote(assetId, amount).catch(() => null);
}

async function load(): Promise<Route[]> {
  const tokens: { assetId: string; price: number; decimals: number }[] = await fetch(`${ONECLICK}/tokens`, {
    headers,
    cache: "no-store",
  }).then((r) => r.json());
  // a few at a time: ten at once gets the last ones refused
  const routes: Route[] = [];
  for (let i = 0; i < HERESIES.length; i += 4) routes.push(...(await Promise.all(HERESIES.slice(i, i + 4).map(one))));
  return routes;

  async function one(h: (typeof HERESIES)[number]): Promise<Route> {
      const assetId = `nep141:${h.mainnet}`;
      const t = tokens.find((x) => x.assetId === assetId);
      if (!t || !t.price) return { symbol: h.symbol, chain: h.chain, open: false, outUsd: null, seconds: null };
      // $100 worth, in raw units
      const whole = 100 / t.price;
      const [i, f = ""] = whole.toFixed(Math.min(t.decimals, 12)).split(".");
      const raw = BigInt(i + (f + "0".repeat(t.decimals)).slice(0, t.decimals));
      const q = await quoteTwice(assetId, raw);
      return {
        symbol: h.symbol,
        chain: h.chain,
        open: !!q,
        outUsd: q ? Number(q.amountOut) / 1e6 : null,
        seconds: q?.timeEstimate ?? null,
      };
  }
}

export async function GET() {
  const ttl = cache?.routes.every((r) => r.open) ? TTL_MS : SHUT_TTL_MS;
  if (!cache || Date.now() - cache.at > ttl) {
    try {
      cache = { at: Date.now(), routes: await load() };
    } catch (e) {
      if (!cache) return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  return Response.json({ checkedAt: cache!.at, routes: cache!.routes }, { headers: { "Cache-Control": "public, max-age=60" } });
}
