// Draws a Bond's NFT image from live contract state (or sample data before
// deployment), as the tall card or as the card on a square mount.

import { createElement } from "react";
import { BondCard, BondSquare, type CardData } from "@/components/BondCard";
import { CARD_FONT_CSS } from "@/lib/card-fonts.generated";
import { DEMO_SNAPSHOT } from "@/lib/demo";
import { compact, fromRaw, usd, vestedFraction } from "@/lib/format";
import { CONSUME_CONTRACT, DEMO, heresyForToken, view, type VestView } from "@/lib/near";

// Concrete colours: NFT renderers do not all understand CSS variables.
const COLOURS: [string, string][] = [
  ["var(--wax, #9b1d18)", "#9b1d18"],
  ["var(--ink)", "#141110"],
  ["var(--paper)", "#efe9dc"],
  ["var(--rubric)", "#b3261e"],
];

const STYLE =
  CARD_FONT_CSS +
  ".bl{font-family:CardBlackletter,serif}.fell{font-family:CardFell,Georgia,serif}.sc{font-family:CardFellSC,Georgia,serif}" +
  ".coin-legend{font-family:CardFellSC,Georgia,serif;fill:#141110;letter-spacing:.5px}";

const date = (ns: bigint) =>
  new Date(Number(ns / BigInt(1_000_000))).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The response for /bond/<id>.svg and /bond/square/<id>.svg. */
export async function bondSvg(rawId: string, square: boolean): Promise<Response> {
  const id = rawId.replace(/\.svg$/i, "");
  if (!/^\d+$/.test(id)) return new Response("Not a Bond number", { status: 400 });

  let v: VestView | null = null;
  if (DEMO) {
    v = DEMO_SNAPSHOT.recent.find((x) => x.token_id === id) ?? null;
  } else {
    v = await view<VestView | null>(CONSUME_CONTRACT, "get_vest", { token_id: id }).catch(() => null);
  }
  if (!v) return new Response("No such Bond", { status: 404 });

  const h = heresyForToken(v.vest.tribe);
  if (!h) return new Response("Unknown meme", { status: 404 });
  const start = BigInt(v.vest.start_ns);
  const end = start + BigInt(v.vest.duration_ns);
  const eatenFull = fromRaw(v.vest.eaten, h.decimals, 0);
  const total = BigInt(v.vest.total);

  const d: CardData = {
    id,
    symbol: h.symbol,
    chain: h.chain,
    eaten: eatenFull.length > 13 ? compact(v.vest.eaten, h.decimals) : eatenFull,
    mealUsd: usd(v.vest.meal_usd),
    consume: fromRaw(v.vest.total, 18, 0),
    from: date(start),
    to: date(end),
    released: v.vest.exited
      ? total > BigInt(0)
        ? Number((BigInt(v.vest.released) * BigInt(1000)) / total) / 1000
        : 0
      : vestedFraction(v.vest.start_ns, v.vest.duration_ns),
    days: Number(BigInt(v.vest.duration_ns) / BigInt(1_000_000_000)) / 86_400,
    exited: v.vest.exited,
    bonus: v.vest.bonus,
  };

  // loaded lazily: Next refuses a static react-dom/server import in the app dir
  const { renderToStaticMarkup } = await import("react-dom/server");
  let svg = renderToStaticMarkup(createElement(square ? BondSquare : BondCard, { d }));
  for (const [from, to] of COLOURS) svg = svg.split(from).join(to);
  svg = svg.replace(/^<svg([^>]*)>/, `<svg$1><style>${STYLE}</style>`);

  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
