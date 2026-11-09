// Sample state shown until the contract is deployed (DEMO mode). Prices are
// real 1Click quotes from 2026-11-09; the amounts are invented.

import { HERESIES } from "./heresies";
import { pow10 } from "./format";
import type { Snapshot, Tribe, VestView } from "./near";

const PRICE_E18: Record<string, string> = {
  DOGE: "70014000000000000",
  SHIB: "4460000000000",
  PEPE: "5130000000000",
  PENGU: "6386910000000000",
  SPX: "363978000000000000",
  TURBO: "710250000000000",
  BOME: "614780000000000",
  BLACKDRAGON: "6411000000",
  SHITZU: "1450420000000000",
  NearKat: "88220000000000",
};

// USD sitting in the stomach per heresy (sample)
const HELD_USD: Record<string, number> = {
  DOGE: 3120, PEPE: 2860, SHIB: 1740, PENGU: 1210, SPX: 980, TURBO: 640, BOME: 455, BLACKDRAGON: 210, SHITZU: 165, NearKat: 60,
};

function rawFor(usdWhole: number, decimals: number, priceE18: string): string {
  return ((BigInt(Math.round(usdWhole * 1e6)) * pow10(12) * pow10(decimals)) / BigInt(priceE18)).toString();
}

const nowNs = BigInt(Date.UTC(2026, 10, 9, 20, 0)) * BigInt(1_000_000);
const DAY = BigInt(86_400) * BigInt(1_000_000_000);

export const DEMO_TOKEN = (symbol: string) => `${symbol.toLowerCase()}.sample`;

const tribes: [string, Tribe][] = HERESIES.map((h) => [
  DEMO_TOKEN(h.symbol),
  {
    symbol: h.symbol,
    decimals: h.decimals,
    price_e18: PRICE_E18[h.symbol],
    price_updated_ns: nowNs.toString(),
    max_meal_usd: String(h.maxMealUsd * 1e6),
    daily_cap_usd: String(h.dailyCapUsd * 1e6),
    open: h.symbol !== "NearKat",
    stomach: rawFor(HELD_USD[h.symbol], h.decimals, PRICE_E18[h.symbol]),
    eaten_usd: String(Math.round(HELD_USD[h.symbol] * 1.08 * 1e6)),
  },
]);

function vest(id: number, owner: string, symbol: string, mealUsd: number, daysAgo: number, opts: Partial<VestView["vest"]> = {}): VestView {
  const h = HERESIES.find((x) => x.symbol === symbol)!;
  // at the current sample rate; a feast feeding earns 1.5x
  const total = (BigInt(mealUsd) * BigInt(500) * pow10(18) * BigInt(opts.bonus ? 3 : 2)) / BigInt(2);
  const start = nowNs - BigInt(daysAgo) * DAY;
  return {
    token_id: String(id),
    owner_id: owner,
    vest: {
      tribe: DEMO_TOKEN(symbol),
      eaten: rawFor(mealUsd, h.decimals, PRICE_E18[symbol]),
      meal_usd: String(mealUsd * 1e6),
      total: total.toString(),
      released: "0",
      start_ns: start.toString(),
      duration_ns: (BigInt(30) * DAY).toString(),
      exited: false,
      bonus: false,
      ...opts,
    },
    // released linearly over 30 days; nothing claimed yet in the sample
    claimable: ((total * BigInt(Math.min(daysAgo, 30))) / BigInt(30)).toString(),
    locked: (total - (total * BigInt(Math.min(daysAgo, 30))) / BigInt(30)).toString(),
    exit_payout: (
      (total * BigInt(Math.min(daysAgo, 30))) / BigInt(30) +
      (total - (total * BigInt(Math.min(daysAgo, 30))) / BigInt(30)) / BigInt(2)
    ).toString(),
  };
}

// Newest first. Numbers follow the dates: the most recent feeding has the highest number.
const recent: VestView[] = [
  vest(214, "brother-odo.testnet", "BLACKDRAGON", 90, 2),
  vest(213, "gutterpriest.testnet", "SPX", 180, 3, { exited: true }),
  vest(212, "anchorite.testnet", "SHIB", 250, 4),
  vest(211, "mirabel.testnet", "TURBO", 300, 4),
  vest(210, "plague-doctor.testnet", "BOME", 120, 5),
  vest(209, "gutterpriest.testnet", "PEPE", 420, 12, { bonus: true }),
  vest(208, "mirabel.testnet", "DOGE", 1000, 21),
  vest(207, "the-miller.testnet", "PENGU", 600, 27),
];

// The wallet's own Indulgences in the preview: a spread of ages.
export const DEMO_MINE = ["209", "208", "212", "207"];

export const DEMO_SNAPSHOT: Snapshot = {
  tribes,
  recent,
  stats: {
    total_eaten_usd: String(12_480 * 1e6),
    consume_supply: (BigInt(3_100_000) * pow10(18)).toString(),
    total_unvested: (BigInt(7_420_000) * pow10(18)).toString(),
    total_forfeited: (BigInt(212_000) * pow10(18)).toString(),
    total_redeemed: (BigInt(480_000) * pow10(18)).toString(),
    vests_minted: "214",
    current_rate: (BigInt(500) * pow10(18)).toString(),
    next_halving_at_usd: String(20_000 * 1e6),
    epoch: "2966",
    heaviest_last_epoch: DEMO_TOKEN("PEPE"),
    now_ns: nowNs.toString(),
  },
  config: {
    start_rate: "1000",
    halving_usd: String(10_000 * 1e6),
    vest_duration_ns: (BigInt(30) * DAY).toString(),
    exit_haircut_bps: 5000,
    heaviest_bonus_bps: 15000,
    epoch_ns: (BigInt(7) * DAY).toString(),
  },
};
