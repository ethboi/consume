// Sample state shown until the contract is deployed (DEMO mode). Prices are
// real 1Click quotes from 2026-11-09; the amounts are invented.

import { HERESIES } from "./heresies";
import { pow10 } from "./format";
import type { Ledger, LedgerEntry } from "./ledger";
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
/** The sample's own clock. The sample amounts are fixed, so its Bonds are read at this moment, not at the real time. */
export const DEMO_NOW_MS = Date.UTC(2026, 10, 9, 20, 0);
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
  // earned at the sample backing, less the 2% tithe; a feast feeding pays none
  const total = (BigInt(mealUsd) * BigInt(920) * pow10(18) * BigInt(opts.bonus ? 100 : 98)) / BigInt(100);
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

// The wallet's own Bonds in the preview: a spread of ages.
export const DEMO_MINE = ["209", "208", "212", "207"];

const SUPPLY = BigInt(3_100_000) * pow10(18);
const UNVESTED = BigInt(7_420_000) * pow10(18);
const STOMACH_MICRO = BigInt(Object.values(HELD_USD).reduce((a, b) => a + b, 0)) * BigInt(1_000_000);

// What each memecoin was fed this week and last (whole USD). This week's agree with the sample ledger above.
const FED_NOW: Record<string, number> = { TURBO: 300, SHIB: 250, SPX: 180, BLACKDRAGON: 90 };
const FED_LAST: Record<string, number> = { PEPE: 640, DOGE: 310, BOME: 120 };
const fedWeek = (by: Record<string, number>): [string, string][] =>
  HERESIES.map((h) => [DEMO_TOKEN(h.symbol), String((by[h.symbol] ?? 0) * 1e6)]);

export const DEMO_SNAPSHOT: Snapshot = {
  tribes,
  recent,
  fed: { now: fedWeek(FED_NOW), last: fedWeek(FED_LAST) },
  stats: {
    total_eaten_usd: String(12_480 * 1e6),
    consume_supply: SUPPLY.toString(),
    total_unvested: UNVESTED.toString(),
    total_forfeited: (BigInt(212_000) * pow10(18)).toString(),
    total_redeemed: (BigInt(480_000) * pow10(18)).toString(),
    vests_minted: "214",
    stomach_usd: STOMACH_MICRO.toString(),
    // one dollar earns its share of every $CONSUME with a claim
    current_rate: (((SUPPLY + UNVESTED) * BigInt(1_000_000)) / STOMACH_MICRO).toString(),
    tithe_bps: 200,
    next_famine_at_usd: String(20_000 * 1e6),
    epoch: "2966",
    heaviest_last_epoch: DEMO_TOKEN("PEPE"),
    now_ns: nowNs.toString(),
  },
  config: {
    start_rate: "1000",
    famine_usd: String(10_000 * 1e6),
    tithe_step_bps: 100,
    max_tithe_bps: 1000,
    vest_duration_ns: (BigInt(30) * DAY).toString(),
    exit_haircut_bps: 5000,
    epoch_ns: (BigInt(7) * DAY).toString(),
  },
};

// ---------- the sample Ledger ----------
// The feedings above, and a few sample mints and burns so that every kind of
// entry can be seen. Sample entries have no transaction, so they carry no link.

const CONSUME_UNIT = pow10(18);
const hoursAgo = (h: number) => DEMO_NOW_MS - h * 3_600_000;

const fedEntries: LedgerEntry[] = recent.map((v) => ({
  id: `sample:feed:${v.token_id}`,
  kind: "feed",
  tx: "",
  at: Number(BigInt(v.vest.start_ns) / BigInt(1_000_000)),
  account: v.owner_id,
  bond: v.token_id,
  token: v.vest.tribe,
  amount: v.vest.eaten,
  usd: v.vest.meal_usd,
  tithe_usd: v.vest.bonus ? "0" : String(Number(v.vest.meal_usd) / 50),
  locked: v.vest.total,
  feast: v.vest.bonus,
}));

// Bond 213 was fed three days ago and its seal broken a day later: one
// thirtieth had vested, and half of the rest is given up and never minted
const broken = recent.find((v) => v.token_id === "213")!;
const brokenTotal = BigInt(broken.vest.total);
const brokenVested = brokenTotal / BigInt(30);
const brokenForfeit = (brokenTotal - brokenVested) / BigInt(2);

// a redemption takes the same share of every memecoin in the Stomach
const REDEEMED = BigInt(40_000) * CONSUME_UNIT;
const redeemShares = tribes
  .map(([token, t]): [string, string] => [token, ((BigInt(t.stomach) * REDEEMED) / (SUPPLY + UNVESTED)).toString()])
  .filter(([, amount]) => amount !== "0");

const otherEntries: LedgerEntry[] = [
  { id: "sample:collect:208", kind: "collect", tx: "", at: hoursAgo(7), account: "mirabel.testnet", bond: "208", minted: (BigInt(214_800) * CONSUME_UNIT).toString() },
  { id: "sample:redeem:1", kind: "redeem", tx: "", at: hoursAgo(31), account: "anchorite.testnet", burned: REDEEMED.toString(), shares: redeemShares },
  {
    id: "sample:break:213",
    kind: "break",
    tx: "",
    at: Number(BigInt(broken.vest.start_ns) / BigInt(1_000_000)) + 86_400_000,
    account: broken.owner_id,
    bond: "213",
    minted: (brokenTotal - brokenForfeit).toString(),
    forfeited: brokenForfeit.toString(),
  },
  { id: "sample:collect:207", kind: "collect", tx: "", at: hoursAgo(150), account: "the-miller.testnet", bond: "207", minted: (BigInt(96_500) * CONSUME_UNIT).toString() },
];

export const DEMO_LEDGER: Ledger = {
  entries: [...fedEntries, ...otherEntries].sort((x, y) => y.at - x.at),
  discovery_limits_reached: false,
  history_completeness: "unknown",
  accounts: 0,
  read_at: new Date(DEMO_NOW_MS).toISOString(),
};
