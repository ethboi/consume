// Read-only access to the CONSUME contract over NEAR JSON-RPC, plus the shapes
// it returns. Writes go through the wallet (see wallet.tsx).

import { HERESIES, type Heresy } from "./heresies";

export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const CONSUME_CONTRACT = process.env.NEXT_PUBLIC_CONSUME_CONTRACT ?? "";
/** Parent account of the testnet mock memes, e.g. "memes.consume.testnet". */
const MEME_PARENT = process.env.NEXT_PUBLIC_MEME_PARENT ?? "";
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
export const EXPLORER = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

/** True until the contract is deployed and configured: the page shows sample data. */
export const DEMO = !CONSUME_CONTRACT;

export function tokenAccount(h: Heresy): string {
  if (DEMO) return `${h.symbol.toLowerCase()}.sample`;
  return NETWORK === "mainnet" ? h.mainnet : `${h.mock}.${MEME_PARENT}`;
}

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
  reliquary: string;
  eaten_usd: string;
};

export type Stats = {
  total_eaten_usd: string;
  consume_supply: string;
  total_unvested: string;
  total_forfeited: string;
  total_redeemed: string;
  vests_minted: string;
  current_rate: string;
  next_halving_at_usd: string;
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

export type MealQuote = { accepted: string; refund: string; meal_usd: string; consume: string; bonus: boolean };
export type RedeemQuote = { shares: [string, string][]; denominator: string };
export type Config = {
  start_rate: string;
  halving_usd: string;
  vest_duration_ns: string;
  exit_haircut_bps: number;
  heaviest_bonus_bps: number;
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
