// What a Bond's card prints, worked out from the Bond itself. Shared by the
// NFT image route and by the page, which shows the card the moment it is minted.

import type { CardData } from "@/components/BondCard";
import { compact, fromRaw, usd } from "./format";
import type { Heresy } from "./heresies";
import type { Vest } from "./near";

const date = (ns: bigint) =>
  new Date(Number(ns / BigInt(1_000_000))).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** `released` is the share already paid out, 0 to 1. */
export function cardData(id: string, vest: Vest, h: Heresy, released: number): CardData {
  const start = BigInt(vest.start_ns);
  const eatenFull = fromRaw(vest.eaten, h.decimals, 0);
  return {
    id,
    symbol: h.symbol,
    chain: h.chain,
    eaten: eatenFull.length > 13 ? compact(vest.eaten, h.decimals) : eatenFull,
    mealUsd: usd(vest.meal_usd),
    consume: fromRaw(vest.total, 18, 0),
    from: date(start),
    to: date(start + BigInt(vest.duration_ns)),
    released,
    days: Number(BigInt(vest.duration_ns) / BigInt(1_000_000_000)) / 86_400,
    exited: vest.exited,
    bonus: vest.bonus,
  };
}
