// Prints the arguments of the one-time `new` call: every number CONSUME will
// ever use. Nothing here can be changed after launch, so read it twice.
//
//   node scripts/launch-args.mjs --guardian g.testnet --assayer a.testnet \
//        --intents intents.example.testnet --media-base https://example.org/bond/square
//
// The memecoin list and its limits come from web/src/lib/heresies.ts, the same
// file the site reads, so the two cannot drift apart.

import { pathToFileURL } from "node:url";
import { HERESIES } from "../web/src/lib/heresies.ts";

const USD = 1_000_000n; // the contract counts dollars in millionths
const DAY_NS = 86_400n * 1_000_000_000n;

export function launchArgs({ guardian, assayer, intents, mediaBase = null }) {
  if (!assayer) throw new Error("--assayer is required (the account that posts prices)");
  if (!intents) throw new Error("--intents is required (intents.near on mainnet, the stand-in on testnet)");
  return {
    config: {
      guardian_id: guardian ?? null, // null launches with no guardian at all
      price_feeder_id: assayer,
      start_rate: "1000", // $CONSUME per dollar for the very first feeding
      famine_usd: (10_000n * USD).toString(), // a famine every $10,000 eaten
      tithe_step_bps: 100, // the tithe starts at 1% and grows 1% per famine
      max_tithe_bps: 1000, // and never passes 10%
      vest_duration_ns: (30n * DAY_NS).toString(),
      exit_haircut_bps: 5000, // breaking the seal forfeits half of what is locked
      max_price_age_ns: (15n * 60n * 1_000_000_000n).toString(),
      min_meal_usd: USD.toString(),
      epoch_ns: (7n * DAY_NS).toString(), // the feast is decided weekly
      media_base: mediaBase, // Bond images are read from <media_base>/<id>.svg
      intents_id: intents,
    },
    tribes: HERESIES.map((h) => ({
      token_id: h.mainnet,
      symbol: h.symbol,
      decimals: h.decimals,
      max_meal_usd: (BigInt(h.maxMealUsd) * USD).toString(),
      daily_cap_usd: (BigInt(h.dailyCapUsd) * USD).toString(),
      via_intents: true,
    })),
  };
}

/** `--name value` pairs and bare `--flags` from the command line. */
export function flags(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    out[key] = next === undefined || next.startsWith("--") ? true : argv[++i];
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(launchArgs(flags()), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
