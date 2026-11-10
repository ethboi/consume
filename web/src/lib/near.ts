// Read-only access to the CONSUME contract over NEAR JSON-RPC, plus the shapes
// it returns. Writes go through the wallet (see wallet.tsx).

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
  /** Raw $CONSUME one dollar mints at the backing, before the tithe. */
  current_rate: string;
  tithe_bps: number;
  /** Null once the tithe is at its most. */
  next_famine_at_usd: string | null;
  epoch: string;
  heaviest_last_epoch: string | null;
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
};

// ---------- RPC ----------

export async function view<T>(contract: string, method: string, args: object = {}): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "consume",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: contract,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data ?? json.error.message ?? "RPC error");
  if (json.result?.error) throw new Error(cleanError(json.result.error));
  const bytes = new Uint8Array(json.result.result);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/** Turn a contract panic into the sentence inside it. */
export function cleanError(e: unknown): string {
  const s = typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
  const m = s.match(/Smart contract panicked: ([^"\\]+)/) ?? s.match(/panicked at[^:]*: ([^"\\]+)/);
  return (m ? m[1] : s).trim();
}

export type Snapshot = {
  stats: Stats;
  tribes: [string, Tribe][];
  recent: VestView[];
  config: Config;
};

export async function loadSnapshot(): Promise<Snapshot> {
  const [stats, tribes, recent, config] = await Promise.all([
    view<Stats>(CONSUME_CONTRACT, "get_stats"),
    view<[string, Tribe][]>(CONSUME_CONTRACT, "get_tribes"),
    view<VestView[]>(CONSUME_CONTRACT, "get_recent_vests", { limit: 12 }),
    view<Config>(CONSUME_CONTRACT, "get_config"),
  ]);
  return { stats, tribes, recent, config };
}
