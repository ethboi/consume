// Read-only access to the CONSUME contract over NEAR JSON-RPC, plus the shapes
// it returns. Writes go through the wallet (see Wallet.tsx), or through the
// guest wallet's own key (lib/guest.ts).

import { HERESIES, type Heresy } from "./heresies";

// Empty values in .env count as unset, so the defaults below apply.
const env = (v: string | undefined) => (v && v.trim()) || undefined;

export const NETWORK = (env(process.env.NEXT_PUBLIC_NETWORK) ?? "testnet") as "testnet" | "mainnet";
export const CONSUME_CONTRACT = env(process.env.NEXT_PUBLIC_CONSUME_CONTRACT) ?? "";
/** Parent account of the testnet mock memes, e.g. "memes.consume.testnet". */
const MEME_PARENT = env(process.env.NEXT_PUBLIC_MEME_PARENT) ?? "";
export const RPC_URL =
  env(process.env.NEXT_PUBLIC_RPC_URL) ??
  (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
export const EXPLORER = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

/** True until the contract is deployed and configured: the page shows sample data. */
export const DEMO = !CONSUME_CONTRACT;

/**
 * The NEAR Intents contract: intents.near on mainnet, or the mock in
 * contracts/mock-intents on testnet (Intents has no testnet). When set,
 * memecoins are fed from and paid back to the wallet's Intents balance.
 */
export const INTENTS_CONTRACT = env(process.env.NEXT_PUBLIC_INTENTS_CONTRACT) ?? "";
/** Feed and redeem through NEAR Intents. The sample page shows this flow too. */
export const VIA_INTENTS = DEMO || !!INTENTS_CONTRACT;
/** Deposits and withdrawals are simulated by the testnet mock. */
export const MOCK_INTENTS = VIA_INTENTS && NETWORK === "testnet";

export function tokenAccount(h: Heresy): string {
  if (DEMO) return `${h.symbol.toLowerCase()}.sample`;
  // the Intents mock uses the real mainnet token ids
  if (INTENTS_CONTRACT || NETWORK === "mainnet") return h.mainnet;
  return `${h.mock}.${MEME_PARENT}`;
}

/** NEP-245 id of a NEP-141 token held on NEAR Intents. */
export const intentsToken = (token: string) => `nep141:${token}`;

export function heresyForToken(tokenId: string): Heresy | undefined {
  return HERESIES.find((h) => tokenAccount(h) === tokenId);
}

// ---------- contract shapes (all u128 as decimal strings) ----------

export type Tribe = {
  symbol: string;
  decimals: number;
  price_e18: string;
  price_updated_ns: string;
  max_meal_usd: string;
  daily_cap_usd: string;
  open: boolean;
  stomach: string;
  eaten_usd: string;
  via_intents?: boolean;
};

export type Stats = {
  total_eaten_usd: string;
  consume_supply: string;
  total_unvested: string;
  total_forfeited: string;
  total_redeemed: string;
  vests_minted: string;
  /** The Stomach at posted prices, in micro-USD. */
  stomach_usd: string;
  /** Raw $CONSUME one dollar earns at the backing, before the tithe. */
  current_rate: string;
  tithe_bps: number;
  /** Null once the tithe is at its most. */
  next_famine_at_usd: string | null;
  epoch: string;
  /** Last week's most fed memecoin, whether or not it could feast. */
  heaviest_last_epoch: string | null;
  /** The memecoin feasting this week: read it with `feastOf` (lib/feast.ts). A contract built before the two-weeks rule does not report it. */
  feast?: string | null;
  now_ns: string;
};

export type Vest = {
  tribe: string;
  eaten: string;
  meal_usd: string;
  total: string;
  released: string;
  start_ns: string;
  duration_ns: string;
  exited: boolean;
  bonus: boolean;
};

export type VestView = {
  token_id: string;
  owner_id: string;
  vest: Vest;
  claimable: string;
  locked: string;
  exit_payout: string;
};

/** `bonus` is the feast: that feeding paid no tithe. */
export type MealQuote = { accepted: string; refund: string; meal_usd: string; tithe_usd: string; consume: string; bonus: boolean };
export type RedeemQuote = { shares: [string, string][]; denominator: string };
export type Config = {
  start_rate: string;
  famine_usd: string;
  tithe_step_bps: number;
  max_tithe_bps: number;
  vest_duration_ns: string;
  exit_haircut_bps: number;
  epoch_ns: string;
  /** The smallest feeding, in micro-USD. */
  min_meal_usd?: string;
  /** Who holds the two roles, as the contract answers. `null` is a renounced guardian; the sample figures name nobody. */
  guardian_id?: string | null;
  price_feeder_id?: string;
};

// ---------- RPC ----------

// Public RPC nodes turn callers away when they are busy (HTTP 429). One refusal
// must not leave the page on sample figures, so a refused question goes to a
// second public node, and then round both again after a short wait, for as
// long as nine seconds.
const RPC_URLS = [...new Set([RPC_URL, NETWORK === "mainnet" ? "https://near.drpc.org" : "https://near-testnet.drpc.org"])];
const RPC_ROUNDS = 3;
const RPC_PATIENCE_MS = 9_000;

/**
 * One question to the NEAR RPC, answered as the node wrote it. `each` is how
 * long one node is given and `all` how long the question is worth asking, in
 * milliseconds: a read is quick, a transaction waited on to its end is not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rpc(method: string, params: unknown, { each = 6_000, all = RPC_PATIENCE_MS } = {}): Promise<any> {
  const began = Date.now();
  let last = "The NEAR RPC could not be reached";
  for (let attempt = 0; attempt < RPC_URLS.length * RPC_ROUNDS; attempt++) {
    const round = Math.floor(attempt / RPC_URLS.length);
    if (round > 0 && attempt % RPC_URLS.length === 0) await new Promise((r) => setTimeout(r, 500 * round));
    if (Date.now() - began > all) break;
    try {
      const res = await fetch(RPC_URLS[attempt % RPC_URLS.length], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "consume", method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(each),
      });
      // an answer, even a refusal from the contract, is final: only a node that would not answer is asked again
      if (res.ok) return await res.json();
      last = `The NEAR RPC answered ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(last);
}

const query = (params: object) => rpc("query", params);

export async function view<T>(contract: string, method: string, args: object = {}): Promise<T> {
  const json = await query({
    request_type: "call_function",
    finality: "optimistic",
    account_id: contract,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });
  if (json.error) throw new Error(json.error.data ?? json.error.message ?? "RPC error");
  if (json.result?.error) throw new Error(cleanError(json.result.error));
  const bytes = new Uint8Array(json.result.result);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/** The accounts that vote in a Sputnik DAO: the members of every role that is a named group. */
export async function daoCouncil(dao: string): Promise<string[]> {
  const policy = await view<{ roles: { kind: unknown }[] }>(dao, "get_policy");
  const members = policy.roles.flatMap((r) =>
    r.kind && typeof r.kind === "object" && "Group" in r.kind && Array.isArray(r.kind.Group) ? (r.kind.Group as string[]) : [],
  );
  return [...new Set(members)];
}

/** How many full-access keys an account holds. With none, nobody can replace its code. */
export async function fullAccessKeys(account: string): Promise<number> {
  const json = await query({ request_type: "view_access_key_list", finality: "final", account_id: account });
  const keys: { access_key?: { permission?: unknown } }[] | undefined = json.result?.keys;
  if (json.error || !Array.isArray(keys)) throw new Error("Could not read the account's keys");
  return keys.filter((k) => k.access_key?.permission === "FullAccess").length;
}

/** Check the recipient exists on this network before preparing an NFT transfer. */
export async function accountExists(account: string): Promise<boolean> {
  const json = await query({ request_type: "view_account", finality: "final", account_id: account });
  if (typeof json.result?.amount === "string") return true;
  if (json.error?.cause?.name === "UNKNOWN_ACCOUNT" || json.error?.data?.name === "UNKNOWN_ACCOUNT") return false;
  throw new Error("Could not check the recipient’s account. Try again shortly.");
}

/** An account's NEAR, in yoctoNEAR. An account the chain has never seen holds none. */
export async function nearBalance(account: string): Promise<bigint> {
  const json = await query({ request_type: "view_account", finality: "final", account_id: account });
  if (typeof json.result?.amount === "string") return BigInt(json.result.amount);
  if (json.error?.cause?.name === "UNKNOWN_ACCOUNT") return BigInt(0);
  throw new Error("Could not read the account's NEAR");
}

/** What the feed form says when a feeding is under the contract's minimum. */
export const MEAL_TOO_SMALL = "That is less than the smallest feeding.";

// The contract's refusals, in the words the page uses. Matched on how the
// refusal starts; anything not listed is shown as the contract wrote it.
const PLAIN: [string, string][] = [
  ["Meal too small", MEAL_TOO_SMALL],
  ["This feeding would mint no $CONSUME", "That is too small to earn any $CONSUME."],
  ["This tribe has eaten its fill today", "The Serpent has had its fill of this memecoin for today. Try again later."],
  ["This tribe is closed", "This memecoin is sealed for now."],
  ["No price for this tribe yet", "The Assayer has not priced this memecoin yet."],
  ["Unknown tribe", "The Serpent does not eat this memecoin."],
  ["CONSUME does not eat this token", "The Serpent does not eat this memecoin."],
  ["Price is stale", "The Assayer's price for this memecoin is out of date. Try again in a few minutes."],
  ["A price in the stomach is stale", "A price for something in the Stomach is out of date. Try again in a few minutes."],
  ["Worth less than your minimum", "The price moved while you were signing, so the feeding was refused and your memecoins came back."],
  ["Pays less than your minimum", "The price moved while you were signing, so the feeding was refused and your memecoins came back."],
  ["Feeding arrived after its deadline", "The feeding arrived too late, so it was refused and your memecoins came back."],
  ["Nothing to claim yet", "Nothing is ready to collect yet."],
  ["Already exited", "This Bond's seal is already broken."],
  ["Only the Bond holder can claim", "Only the Bond's holder can collect from it."],
  ["Only the Bond holder can exit", "Only the Bond's holder can break its seal."],
  ["This Bond is mid-transfer", "This Bond is being transferred. Try again in a moment."],
  [
    "Add storage credit first (add_meal_credit), refunded",
    "Your storage credit had not arrived, so the feeding was refused and your memecoins came back. Feed again.",
  ],
  ["Add storage credit first (add_meal_credit):", "This account is not set up to hold $CONSUME yet. Try again and the page sets it up first."],
  ["Attach more NEAR", "That is too little NEAR to open a storage credit."],
  ["Not enough credit", "You have less storage credit than that."],
  ["Nothing to redeem", "Type how much $CONSUME to burn."],
  ["Too little to redeem", "That is too little $CONSUME to redeem: your share of every memecoin rounds to nothing."],
  ["Redeem or transfer your $CONSUME first", "Redeem or send away your $CONSUME first."],
  ["Not enough balance", "You hold less of that memecoin than you tried to send."],
  ["One simulated deposit per token per hour", "The test faucet gives each memecoin once an hour. Try again later, or feed another memecoin."],
];

// What goes wrong before a contract is reached, matched anywhere in the message.
const TROUBLE: [RegExp, string][] = [
  [/user (rejected|cancell?ed|denied|closed)|rejected by (the )?user|request (was )?rejected|cancell?ed by/i, "The wallet did not sign, so nothing was sent."],
  [/exceeded the prepaid gas|GasExceeded|GasLimitExceeded/i, "The transaction ran out of gas, so nothing changed. Try again."],
  [/NotEnoughBalance|LackBalanceForState|does not have enough balance/i, "This account does not hold enough NEAR to pay for the transaction."],
  [/failed to fetch|networkerror|load failed|timed? ?out|\b(429|502|503|504)\b/i, "Could not reach NEAR just now. Try again in a moment."],
];

/** Turn a contract panic into a sentence a person can read: the refusal
 *  inside it, without the machinery, in the page's own words where it has them. */
export function cleanError(e: unknown): string {
  const s = typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
  const m =
    s.match(/panic_msg:\s*\\?"([^"\\]+)/) ?? // a view call: HostError(GuestPanic { panic_msg: "..." })
    s.match(/Smart contract panicked: ([^"\\]+)/) ??
    s.match(/panicked at[^:]*: ([^"\\]+)/);
  const said = (m ? m[1] : s).trim();
  const plain = PLAIN.find(([starts]) => said.startsWith(starts))?.[1];
  if (plain) return plain;
  // a contract's own words stand; only the machinery around a call is translated
  return (m ? undefined : TROUBLE.find(([re]) => re.test(said))?.[1]) ?? said;
}

/** What each memecoin was fed in one week, in micro-USD, in the contract's own order. */
export type Fed = [string, string][];

export type Snapshot = {
  stats: Stats;
  tribes: [string, Tribe][];
  recent: VestView[];
  config: Config;
  /** This week's and last week's feedings, for the Feast race. Null when they could not be read. */
  fed: { now: Fed; last: Fed } | null;
};

export async function loadSnapshot(): Promise<Snapshot> {
  const [stats, tribes, recent, config] = await Promise.all([
    view<Stats>(CONSUME_CONTRACT, "get_stats"),
    view<[string, Tribe][]>(CONSUME_CONTRACT, "get_tribes"),
    view<VestView[]>(CONSUME_CONTRACT, "get_recent_vests", { limit: 12 }),
    view<Config>(CONSUME_CONTRACT, "get_config"),
  ]);
  // the race is extra: if it cannot be read the page says so, and the rest still loads
  const epoch = BigInt(stats.epoch);
  const week = (e: bigint) => view<Fed>(CONSUME_CONTRACT, "get_epoch_fed", { epoch: e.toString() });
  const fed = await Promise.all([week(epoch), epoch > BigInt(0) ? week(epoch - BigInt(1)) : Promise.resolve<Fed>([])])
    .then(([now, last]) => ({ now, last }))
    .catch(() => null);
  return { stats, tribes, recent, config, fed };
}
