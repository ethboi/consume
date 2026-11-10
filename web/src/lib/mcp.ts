// CONSUME for agents: everything an agent needs to read the contract and to
// prepare a feeding, a collection, a broken seal or a redemption, as plain
// functions and as a Model Context Protocol server.
//
// Nothing here holds a key or signs. The `prepare_*` tools return the exact
// contract calls (and the matching `near` CLI commands) for the agent's own
// wallet to sign.
//
// The same file serves the site's /api/mcp route and the stdio server and the
// bots in agents/, which Node runs straight from this source. So it imports
// nothing from the site but the memecoin list, and it is written without
// BigInt literals (the site compiles to ES2017).

import { HERESIES } from "./heresies.ts";
import { readLedger } from "./ledger.ts";

export type Net = { network: "testnet" | "mainnet"; rpcUrl: string; consume: string; intents: string };

/** The public testnet deployment. */
export const LIVE_TESTNET: Net = {
  network: "testnet",
  rpcUrl: "https://test.rpc.fastnear.com",
  consume: "consume.consumecash.testnet",
  intents: "intents.consumecash.testnet",
};

/** A deployment from loose settings (flags, environment). Anything left out falls back to the live testnet one. */
export function netFrom(o: { network?: string; consume?: string; intents?: string; rpcUrl?: string }): Net {
  const network = o.network === "mainnet" ? "mainnet" : "testnet";
  if (network === "testnet") {
    const consume = o.consume || LIVE_TESTNET.consume;
    // another testnet deployment has its own stand-in for NEAR Intents: never pair it with ours
    return { network, consume, intents: o.intents || (consume === LIVE_TESTNET.consume ? LIVE_TESTNET.intents : ""), rpcUrl: o.rpcUrl || LIVE_TESTNET.rpcUrl };
  }
  if (!o.consume) throw new Error("CONSUME is not on mainnet. Name a contract to read one there.");
  return { network, consume: o.consume, intents: o.intents || "intents.near", rpcUrl: o.rpcUrl || "https://free.rpc.fastnear.com" };
}

// ---------- contract shapes (every u128 and u64 arrives as a decimal string) ----------

type Tribe = {
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
type Stats = {
  total_eaten_usd: string;
  consume_supply: string;
  total_unvested: string;
  total_forfeited: string;
  total_redeemed: string;
  vests_minted: string;
  stomach_usd: string;
  tithe_bps: number;
  next_famine_at_usd: string | null;
  epoch: string;
  heaviest_last_epoch: string | null;
  now_ns: string;
};
type Config = {
  start_rate: string;
  famine_usd: string;
  tithe_step_bps: number;
  max_tithe_bps: number;
  vest_duration_ns: string;
  exit_haircut_bps: number;
  epoch_ns: string;
  min_meal_usd?: string;
  max_price_age_ns?: string;
};
type Vest = {
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
type VestView = { token_id: string; owner_id: string; vest: Vest; claimable: string; locked: string; exit_payout: string };
type MealQuote = { accepted: string; refund: string; meal_usd: string; tithe_usd: string; consume: string; bonus: boolean };
type RedeemQuote = { shares: [string, string][]; denominator: string };

// ---------- NEAR RPC, read only ----------

async function query(net: Net, params: object): Promise<{ result?: Record<string, unknown>; error?: { cause?: { name?: string }; data?: unknown; message?: string } }> {
  // public RPC nodes turn callers away when busy: wait and ask again, four times at most
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(net.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "consume-agent", method: "query", params }),
      cache: "no-store",
    });
    if (res.ok) return res.json();
    if (attempt === 4 || (res.status !== 429 && res.status < 500)) throw new Error(`NEAR RPC answered ${res.status}`);
    await new Promise((r) => setTimeout(r, 700 * 2 ** attempt));
  }
}

/** A contract's refusal, in its own words, without the machinery around it. */
function refusal(e: unknown): string {
  const s = typeof e === "string" ? e : JSON.stringify(e);
  const m = s.match(/panic_msg:\s*\\?"([^"\\]+)/) ?? s.match(/Smart contract panicked: ([^"\\]+)/) ?? s.match(/panicked at[^:]*: ([^"\\]+)/);
  return (m ? m[1] : s).trim();
}

export async function view<T>(net: Net, contract: string, method: string, args: object = {}): Promise<T> {
  const json = await query(net, {
    request_type: "call_function",
    finality: "optimistic",
    account_id: contract,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });
  if (json.error) throw new Error(refusal(json.error.data ?? json.error.message ?? "NEAR RPC error"));
  if (json.result?.error) throw new Error(refusal(json.result.error));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(json.result!.result as number[]))) as T;
}

// ---------- units ----------

const ZERO = BigInt(0);
const TEN = BigInt(10);
const MICRO = BigInt(1_000_000);
const CONSUME_DECIMALS = 18;
const pow10 = (n: number) => TEN ** BigInt(n);

/** Raw units as a decimal string, trimmed. */
export function whole(raw: string | bigint, decimals: number, places = 6): string {
  const v = BigInt(raw);
  const scale = pow10(decimals);
  const int = (v / scale).toString();
  const frac = (v % scale).toString().padStart(decimals, "0").slice(0, places).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** A decimal string as raw units. Digits past the token's decimals are dropped. */
export function toRaw(text: string | number, decimals: number): bigint {
  const s = String(text).trim().replace(/,/g, "");
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) throw new Error(`"${text}" is not an amount. Write it as a plain number such as 12.5`);
  const [int, frac = ""] = s.split(".");
  return BigInt((int || "0") + (frac + "0".repeat(decimals)).slice(0, decimals));
}

const usd = (micro: string | bigint) => Number(BigInt(micro)) / 1e6;
const consume = (raw: string | bigint) => whole(raw, CONSUME_DECIMALS, 4);
const iso = (ns: string | bigint) => new Date(Number(BigInt(ns) / MICRO)).toISOString();
const priceUsd = (t: Tribe) => Number(BigInt(t.price_e18)) / 1e18;
/** contract's `usd_value`: raw units at the posted price, in micro-USD, rounded down. */
const valueUsd = (raw: string | bigint, t: Tribe) => usd((BigInt(raw) * BigInt(t.price_e18)) / (pow10(t.decimals) * pow10(12)));

const chainOf = (symbol: string) => HERESIES.find((h) => h.symbol === symbol)?.chain ?? "NEAR";
const intentsToken = (token: string) => `nep141:${token}`;

// One tool call reads the same few views several times over, and public RPC nodes
// count requests. The rules never change after launch; the rest is kept for a few seconds.
const kept = new Map<string, { until: number; value: Promise<unknown> }>();
function keep<T>(net: Net, method: string, ms: number): Promise<T> {
  const key = `${net.rpcUrl} ${net.consume} ${method}`;
  const hit = kept.get(key);
  if (hit && hit.until > Date.now()) return hit.value as Promise<T>;
  const value = view<T>(net, net.consume, method);
  kept.set(key, { until: Date.now() + ms, value });
  value.catch(() => kept.delete(key));
  return value;
}
const tribes = (net: Net) => keep<[string, Tribe][]>(net, "get_tribes", 4_000);
const readStats = (net: Net) => keep<Stats>(net, "get_stats", 4_000);
const readConfig = (net: Net) => keep<Config>(net, "get_config", 600_000);

function find(all: [string, Tribe][], symbol: unknown): [string, Tribe] {
  const want = String(symbol ?? "").trim().toLowerCase();
  const hit = all.find(([id, t]) => t.symbol.toLowerCase() === want || id.toLowerCase() === want);
  if (!hit) throw new Error(`CONSUME does not eat "${symbol}". It eats: ${all.map(([, t]) => t.symbol).join(", ")}`);
  return hit;
}

function accountId(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,64}$/.test(s)) throw new Error("account_id must be a NEAR account, such as you.testnet");
  return s;
}

// ---------- reading ----------

export async function overview(net: Net) {
  const [stats, config, all] = await Promise.all([
    readStats(net),
    readConfig(net),
    tribes(net),
  ]);
  const claims = BigInt(stats.consume_supply) + BigInt(stats.total_unvested);
  const now = BigInt(stats.now_ns);
  const weekEnds = (BigInt(stats.epoch) + BigInt(1)) * BigInt(config.epoch_ns);
  const priced = all.filter(([, t]) => t.open || BigInt(t.stomach) > ZERO);
  const oldest = priced.reduce((a, [, t]) => (BigInt(t.price_updated_ns) < a ? BigInt(t.price_updated_ns) : a), now);
  const maxAge = config.max_price_age_ns ? Number(BigInt(config.max_price_age_ns) / BigInt(1_000_000_000)) : null;
  const age = Number((now - oldest) / BigInt(1_000_000_000));
  const feast = stats.heaviest_last_epoch ? (all.find(([id]) => id === stats.heaviest_last_epoch)?.[1].symbol ?? stats.heaviest_last_epoch) : null;
  return {
    what_it_is:
      "CONSUME is a memecoin that eats other memecoins. Feed it a listed memecoin and you get a Bond, an NFT that releases $CONSUME over the vesting period. Every $CONSUME can be burned (redeemed) for its share of every memecoin in the Stomach.",
    network: net.network,
    contract: net.consume,
    intents_contract: net.intents || null,
    stomach_usd: usd(stats.stomach_usd),
    backing_usd_per_1000_consume: claims === ZERO ? null : Number((BigInt(stats.stomach_usd) * pow10(CONSUME_DECIMALS) * BigInt(1000)) / claims) / 1e6,
    consume_in_wallets: consume(stats.consume_supply),
    consume_locked_in_bonds: consume(stats.total_unvested),
    consume_forfeited_by_broken_seals: consume(stats.total_forfeited),
    consume_burned_by_redeeming: consume(stats.total_redeemed),
    total_fed_usd: usd(stats.total_eaten_usd),
    bonds_minted: Number(stats.vests_minted),
    tithe_percent: stats.tithe_bps / 100,
    tithe_rises_when_total_fed_reaches_usd: stats.next_famine_at_usd ? usd(stats.next_famine_at_usd) : null,
    feast_now: feast,
    feast_note: feast ? `Feeding ${feast} pays no tithe until the week ends.` : "No memecoin is feasting this week, so every feeding pays the tithe.",
    week_ends: iso(weekEnds),
    seconds_until_week_ends: Number((weekEnds - now) / BigInt(1_000_000_000)),
    prices: {
      oldest_price_age_seconds: age,
      feedings_refused_when_older_than_seconds: maxAge,
      fresh: maxAge === null ? null : age <= maxAge,
    },
    rules: {
      bond_vests_over_days: Number(BigInt(config.vest_duration_ns) / BigInt(86_400_000_000_000)),
      breaking_the_seal_forfeits_percent_of_locked: config.exit_haircut_bps / 100,
      smallest_feeding_usd: config.min_meal_usd ? usd(config.min_meal_usd) : null,
      tithe_step_percent: config.tithe_step_bps / 100,
      tithe_steps_up_every_usd_fed: usd(config.famine_usd),
      tithe_at_most_percent: config.max_tithe_bps / 100,
      week_days: Number(BigInt(config.epoch_ns) / BigInt(86_400_000_000_000)),
      consume_per_usd_into_an_empty_stomach: Number(config.start_rate),
    },
  };
}

export async function memecoins(net: Net) {
  const [stats, all] = await Promise.all([readStats(net), tribes(net)]);
  const now = BigInt(stats.now_ns);
  return all.map(([id, t]) => ({
    symbol: t.symbol,
    token_id: id,
    intents_token_id: t.via_intents ? intentsToken(id) : null,
    home_chain: chainOf(t.symbol),
    decimals: t.decimals,
    open_for_feeding: t.open,
    price_usd: priceUsd(t),
    price_age_seconds: Number((now - BigInt(t.price_updated_ns)) / BigInt(1_000_000_000)),
    largest_feeding_usd: usd(t.max_meal_usd),
    daily_cap_usd: usd(t.daily_cap_usd),
    in_stomach: whole(t.stomach, t.decimals),
    in_stomach_usd: valueUsd(t.stomach, t),
    fed_all_time_usd: usd(t.eaten_usd),
  }));
}

export async function feastRace(net: Net) {
  const [stats, config, all] = await Promise.all([
    readStats(net),
    readConfig(net),
    tribes(net),
  ]);
  const fed = await view<[string, string][]>(net, net.consume, "get_epoch_fed", { epoch: stats.epoch });
  const symbol = (id: string) => all.find(([k]) => k === id)?.[1].symbol ?? id;
  // the contract's own order decides a tie: the first listed wins
  const rows = fed.map(([id, micro], listed) => ({ symbol: symbol(id), fed_usd: usd(micro), micro: BigInt(micro), listed }));
  const standings = [...rows].sort((a, b) => (a.micro === b.micro ? a.listed - b.listed : a.micro < b.micro ? 1 : -1));
  const leader = standings[0] && standings[0].micro > ZERO ? standings[0] : null;
  const weekEnds = (BigInt(stats.epoch) + BigInt(1)) * BigInt(config.epoch_ns);
  return {
    rule: "Each week the most fed memecoin (by USD) wins the Feast. For the following week, feeding it pays no tithe. On a tie the memecoin listed first wins.",
    week: stats.epoch,
    week_ends: iso(weekEnds),
    seconds_until_week_ends: Number((weekEnds - BigInt(stats.now_ns)) / BigInt(1_000_000_000)),
    feasting_now: stats.heaviest_last_epoch ? symbol(stats.heaviest_last_epoch) : null,
    leading: leader?.symbol ?? null,
    standings: standings.map((r, i) => ({
      place: i + 1,
      symbol: r.symbol,
      fed_usd: r.fed_usd,
      behind_leader_usd: leader ? usd(leader.micro - r.micro) : 0,
    })),
  };
}

/** The raw amount an agent means: a count of the memecoin, or a dollar value at the posted price. */
function offered(t: Tribe, args: { amount?: unknown; usd?: unknown }): bigint {
  if (args.amount !== undefined && args.amount !== null && args.amount !== "") return toRaw(String(args.amount), t.decimals);
  if (args.usd !== undefined && args.usd !== null && args.usd !== "") {
    const price = BigInt(t.price_e18);
    if (price === ZERO) throw new Error(`${t.symbol} has no price yet`);
    // rounded up to the next unit, so that $25 is not counted as $24.999999
    return (toRaw(String(args.usd), 6) * pow10(t.decimals) * pow10(12) + price - BigInt(1)) / price;
  }
  throw new Error("Give either `amount` (a count of the memecoin) or `usd` (a dollar value)");
}

function feedingView(t: Tribe, raw: bigint, q: MealQuote, vestDays: number) {
  return {
    memecoin: t.symbol,
    offered: whole(raw, t.decimals),
    accepted: whole(q.accepted, t.decimals),
    refunded_over_the_cap: whole(q.refund, t.decimals),
    value_usd: usd(q.meal_usd),
    tithe_usd: usd(q.tithe_usd),
    feast_no_tithe: q.bonus,
    consume_in_the_bond: consume(q.consume),
    released_over_days: vestDays,
  };
}

export async function quoteFeeding(net: Net, args: { symbol?: unknown; amount?: unknown; usd?: unknown }) {
  const [config, all] = await Promise.all([readConfig(net), tribes(net)]);
  const [id, t] = find(all, args.symbol);
  const raw = offered(t, args);
  const q = await view<MealQuote>(net, net.consume, "quote_meal", { token_id: id, amount: raw.toString() });
  return feedingView(t, raw, q, Number(BigInt(config.vest_duration_ns) / BigInt(86_400_000_000_000)));
}

export async function quoteRedeem(net: Net, args: { amount?: unknown }) {
  const raw = toRaw(String(args.amount ?? ""), CONSUME_DECIMALS);
  const [all, q] = await Promise.all([tribes(net), view<RedeemQuote>(net, net.consume, "quote_redeem", { amount: raw.toString() })]);
  const paid = q.shares
    .filter(([, share]) => BigInt(share) > ZERO)
    .map(([id, share]) => {
      const t = all.find(([k]) => k === id)![1];
      return { memecoin: t.symbol, amount: whole(share, t.decimals), value_usd: valueUsd(share, t) };
    });
  return {
    burned_consume: consume(raw),
    paid_out: paid,
    total_value_usd: Math.round(paid.reduce((a, p) => a + p.value_usd, 0) * 1e6) / 1e6,
    note: "Paid in the memecoins themselves, the same share of each. Shares are counted against all $CONSUME, including what is still locked in Bonds.",
  };
}

function bondView(v: VestView, all: [string, Tribe][]) {
  const t = all.find(([k]) => k === v.vest.tribe)?.[1];
  const ready = BigInt(v.claimable);
  const locked = BigInt(v.locked);
  const out = BigInt(v.exit_payout);
  return {
    bond_id: v.token_id,
    holder: v.owner_id,
    fed: t ? `${whole(v.vest.eaten, t.decimals)} ${t.symbol}` : v.vest.tribe,
    fed_value_usd: usd(v.vest.meal_usd),
    paid_no_tithe: v.vest.bonus,
    consume_total: consume(v.vest.total),
    consume_collected: consume(v.vest.released),
    consume_ready_to_collect: consume(ready),
    consume_still_locked: consume(locked),
    seal_broken: v.vest.exited,
    fully_released: iso(BigInt(v.vest.start_ns) + BigInt(v.vest.duration_ns)),
    if_the_seal_were_broken_now: v.vest.exited ? null : { received: consume(out), forfeited: consume(ready + locked - out) },
  };
}

export async function bond(net: Net, args: { bond_id?: unknown }) {
  const id = String(args.bond_id ?? "").trim();
  if (!id) throw new Error("bond_id is needed");
  const [all, v] = await Promise.all([tribes(net), view<VestView | null>(net, net.consume, "get_vest", { token_id: id })]);
  if (!v) throw new Error(`There is no Bond ${id}`);
  return bondView(v, all);
}

export async function recentFeedings(net: Net, args: { limit?: unknown }) {
  const limit = Math.max(1, Math.min(50, Number(args.limit ?? 12) || 12));
  const [all, vests] = await Promise.all([tribes(net), view<VestView[]>(net, net.consume, "get_recent_vests", { limit })]);
  return vests.map((v) => ({ ...bondView(v, all), fed_at: iso(v.vest.start_ns) }));
}

const LEDGER_KINDS = ["feed", "collect", "break", "redeem"] as const;

/** The log of every feeding, mint and burn, read from the contract's event logs, with the contract's own totals beside it. */
export async function ledger(net: Net, args: { kind?: unknown; limit?: unknown }) {
  const limit = Math.max(1, Math.min(200, Number(args.limit ?? 50) || 50));
  const kind = String(args.kind ?? "all").trim().toLowerCase();
  if (kind !== "all" && !LEDGER_KINDS.some((k) => k === kind)) throw new Error("kind is one of: all, feed, collect, break, redeem");
  const [all, stats, vests] = await Promise.all([
    tribes(net),
    view<Stats>(net, net.consume, "get_stats"),
    view<VestView[]>(net, net.consume, "get_recent_vests", { limit: 100 }),
  ]);
  const read = await readLedger({ network: net.network, consume: net.consume }, [...new Set(vests.map((v) => v.owner_id))]);
  const sum = (k: "minted" | "burned" | "forfeited") => read.entries.reduce((x, e) => x + BigInt(e[k] || "0"), ZERO);
  const listed = { minted: sum("minted"), burned: sum("burned"), forfeited: sum("forfeited") };
  // $CONSUME in wallets is all that was minted less all that was burned
  const counted = {
    minted: BigInt(stats.consume_supply) + BigInt(stats.total_redeemed),
    burned: BigInt(stats.total_redeemed),
    forfeited: BigInt(stats.total_forfeited),
  };
  const coin = (token: string, raw: string) => {
    const t = all.find(([k]) => k === token)?.[1];
    return t ? { symbol: t.symbol, amount: whole(raw, t.decimals) } : { token, raw };
  };
  const explorer = net.network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
  const entries = read.entries
    .filter((e) => kind === "all" || e.kind === kind)
    .slice(0, limit)
    .map((e) => ({
      kind: e.kind,
      at: new Date(e.at).toISOString(),
      account: e.account,
      ...(e.bond ? { bond_id: e.bond } : {}),
      ...(e.kind === "feed"
        ? {
            fed: coin(e.token ?? "", e.amount ?? "0"),
            worth_usd: usd(e.usd || "0"),
            tithe_usd: usd(e.tithe_usd || "0"),
            feast: e.feast === true,
            consume_locked: consume(e.locked || "0"),
          }
        : {}),
      ...(e.minted ? { consume_minted: consume(e.minted) } : {}),
      ...(e.forfeited ? { consume_forfeited: consume(e.forfeited) } : {}),
      ...(e.kind === "redeem" ? { consume_burned: consume(e.burned || "0"), paid: (e.shares ?? []).map(([t, raw]) => coin(t, raw)) } : {}),
      transaction: e.tx,
      transaction_url: `${explorer}/txns/${e.tx}`,
    }));
  return {
    note: "A feeding mints nothing: it writes $CONSUME into a Bond. $CONSUME is minted when a Bond is collected from or its seal is broken, and burned when it is redeemed. What a broken seal forfeits is never minted.",
    contract_totals: { consume_minted: consume(counted.minted), consume_burned: consume(counted.burned), consume_forfeited: consume(counted.forfeited) },
    entries_add_up_to: { consume_minted: consume(listed.minted), consume_burned: consume(listed.burned), consume_forfeited: consume(listed.forfeited) },
    every_mint_and_burn_is_listed: counted.minted === listed.minted && counted.burned === listed.burned && counted.forfeited === listed.forfeited,
    older_entries_may_be_missing: !read.complete,
    entries_found: read.entries.length,
    entries,
  };
}

async function nearBalance(net: Net, id: string): Promise<bigint> {
  const json = await query(net, { request_type: "view_account", finality: "final", account_id: id });
  if (typeof json.result?.amount === "string") return BigInt(json.result.amount);
  if (json.error?.cause?.name === "UNKNOWN_ACCOUNT") return ZERO;
  throw new Error("Could not read the account's NEAR");
}

/** What an account holds of each listed memecoin, where the contract would take it from. */
async function held(net: Net, id: string, all: [string, Tribe][]): Promise<bigint[]> {
  const viaIntents = all.filter(([, t]) => t.via_intents);
  const inIntents: string[] =
    viaIntents.length && net.intents
      ? await view<string[]>(net, net.intents, "mt_batch_balance_of", { account_id: id, token_ids: viaIntents.map(([k]) => intentsToken(k)) })
      : [];
  return Promise.all(
    all.map(async ([k, t]) => {
      if (t.via_intents) return BigInt(inIntents[viaIntents.findIndex(([x]) => x === k)] ?? "0");
      return BigInt(await view<string>(net, k, "ft_balance_of", { account_id: id }).catch(() => "0"));
    }),
  );
}

export async function account(net: Net, args: { account_id?: unknown }) {
  const id = accountId(args.account_id);
  const all = await tribes(net);
  const [near, balance, credit, vests, owed, memes] = await Promise.all([
    nearBalance(net, id),
    view<string>(net, net.consume, "ft_balance_of", { account_id: id }),
    view<string>(net, net.consume, "get_meal_credit", { account_id: id }),
    view<VestView[]>(net, net.consume, "get_vests_for_owner", { account_id: id, from_index: 0, limit: 50 }),
    view<[string, string][]>(net, net.consume, "get_owed", { account_id: id }),
    held(net, id, all),
  ]);
  return {
    account_id: id,
    near: whole(near, 24, 4),
    consume: consume(balance),
    storage_credit_near: whole(credit ?? "0", 24, 4),
    memecoins_ready_to_feed: all
      .map(([, t], i) => ({ memecoin: t.symbol, amount: whole(memes[i], t.decimals), value_usd: valueUsd(memes[i], t), held_in: t.via_intents ? "NEAR Intents balance" : "token balance" }))
      .filter((m) => m.amount !== "0"),
    bonds: vests.map((v) => bondView(v, all)),
    owed_from_failed_payouts: owed.map(([k, raw]) => {
      const t = all.find(([x]) => x === k)![1];
      return { memecoin: t.symbol, amount: whole(raw, t.decimals) };
    }),
  };
}

// ---------- preparing transactions: nothing here signs or sends ----------

/** One contract call for the agent's own wallet to sign. */
export type Call = {
  receiver_id: string;
  method: string;
  args: Record<string, unknown>;
  /** Attached deposit in yoctoNEAR. */
  deposit_yocto: string;
  gas_tgas: number;
  why: string;
};

const CREDIT_TOP_UP = "100000000000000000000000"; // 0.1 NEAR, as the site sends
const CREDIT_LOW = BigInt("30000000000000000000000"); // below 0.03 NEAR, top up

/** The `near` CLI words that sign and send one call from the local keychain. */
export function nearCliArgs(net: Net, signer: string, c: Call): string[] {
  return [
    "contract", "call-function", "as-transaction", c.receiver_id, c.method,
    "json-args", JSON.stringify(c.args),
    "prepaid-gas", `${c.gas_tgas}.0 Tgas`,
    "attached-deposit", c.deposit_yocto === "0" ? "0 NEAR" : `${c.deposit_yocto} yoctoNEAR`,
    "sign-as", signer,
    "network-config", net.network,
    "sign-with-legacy-keychain", "send",
  ];
}

const shell = (words: string[]) => words.map((w) => (/^[A-Za-z0-9._:\/-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`)).join(" ");

export type Plan = { summary: string; warnings: string[]; calls: Call[] };

function planned(net: Net, signer: string, plan: Plan, extra: object = {}) {
  return {
    signs_nothing: "These are unsigned calls. Sign them in order with the account's own wallet, or run the near CLI lines.",
    summary: plan.summary,
    warnings: plan.warnings,
    ...extra,
    calls: plan.calls,
    near_cli: plan.calls.map((c) => `near ${shell(nearCliArgs(net, signer, c))}`),
  };
}

function testDepositCall(net: Net, id: string, t: Tribe): Call {
  return {
    receiver_id: net.intents,
    method: "simulate_deposit",
    args: { token_id: intentsToken(id), from_chain: chainOf(t.symbol) },
    deposit_yocto: "0",
    gas_tgas: 30,
    why: `Testnet only: credit test ${t.symbol} to the account's NEAR Intents balance, as if it had arrived from ${chainOf(t.symbol)}. Once an hour per memecoin.`,
  };
}

/** The calls for one feeding, with the quote they were built from. */
export async function planFeed(net: Net, args: { account_id?: unknown; symbol?: unknown; amount?: unknown; usd?: unknown; bring_test_memecoins?: unknown }) {
  const who = accountId(args.account_id);
  const [config, all] = await Promise.all([readConfig(net), tribes(net)]);
  const [id, t] = find(all, args.symbol);
  const raw = offered(t, args);
  const [q, credit, balances] = await Promise.all([
    view<MealQuote>(net, net.consume, "quote_meal", { token_id: id, amount: raw.toString() }),
    view<string>(net, net.consume, "get_meal_credit", { account_id: who }),
    held(net, who, all),
  ]);
  const accepted = BigInt(q.accepted);
  const have = balances[all.findIndex(([k]) => k === id)];
  const calls: Call[] = [];
  const warnings: string[] = [];
  if (have < accepted) {
    const canBring = net.network === "testnet" && !!t.via_intents && !!net.intents;
    if (canBring && args.bring_test_memecoins) calls.push(testDepositCall(net, id, t));
    else {
      warnings.push(
        `${who} holds ${whole(have, t.decimals)} ${t.symbol} and this feeding takes ${whole(accepted, t.decimals)}.` +
          (canBring ? " On testnet a test deposit brings test memecoins first: prepare_test_deposit, bring_test_memecoins: true, or --bring in the bots." : ""),
      );
    }
  }
  if (BigInt(credit ?? "0") < CREDIT_LOW) {
    calls.push({
      receiver_id: net.consume,
      method: "add_meal_credit",
      args: {},
      deposit_yocto: CREDIT_TOP_UP,
      gas_tgas: 10,
      why: "Prepay 0.1 NEAR of storage credit for the Bond. Unused credit can be taken back with withdraw_meal_credit.",
    });
  }
  // as the site does: refuse a feeding counted at under 99% of the quoted value after the
  // tithe, or one that lands more than ten minutes from now
  const deadline = Date.now() + 10 * 60_000;
  const msg = JSON.stringify({
    min_net_usd: (((BigInt(q.meal_usd) - BigInt(q.tithe_usd)) * BigInt(99)) / BigInt(100)).toString(),
    deadline_ns: (BigInt(deadline) * MICRO).toString(),
  });
  const why = `Feed ${whole(accepted, t.decimals)} ${t.symbol} (about $${usd(q.meal_usd).toFixed(2)}) to the Stomach. A Bond is minted to ${who}.`;
  calls.push(
    t.via_intents
      ? { receiver_id: net.intents, method: "mt_transfer_call", args: { receiver_id: net.consume, token_id: intentsToken(id), amount: accepted.toString(), msg }, deposit_yocto: "1", gas_tgas: 150, why }
      : { receiver_id: id, method: "ft_transfer_call", args: { receiver_id: net.consume, amount: accepted.toString(), msg }, deposit_yocto: "1", gas_tgas: 150, why },
  );
  const quote = feedingView(t, raw, q, Number(BigInt(config.vest_duration_ns) / BigInt(86_400_000_000_000)));
  const plan: Plan = {
    summary: `Feed ${quote.accepted} ${t.symbol} worth $${quote.value_usd.toFixed(2)} for a Bond of ${quote.consume_in_the_bond} $CONSUME released over ${quote.released_over_days} days${q.bonus ? ", with no tithe (the Feast)" : `, after a tithe of $${quote.tithe_usd.toFixed(2)}`}.`,
    warnings,
    calls,
  };
  return { who, quote, plan, sign_before: new Date(deadline).toISOString() };
}

async function planBond(net: Net, args: { account_id?: unknown; bond_id?: unknown }, method: "claim" | "exit") {
  const who = accountId(args.account_id);
  const id = String(args.bond_id ?? "").trim();
  if (!id) throw new Error("bond_id is needed");
  const [all, v, registered] = await Promise.all([
    tribes(net),
    view<VestView | null>(net, net.consume, "get_vest", { token_id: id }),
    view<unknown>(net, net.consume, "storage_balance_of", { account_id: who }),
  ]);
  if (!v) throw new Error(`There is no Bond ${id}`);
  const b = bondView(v, all);
  const warnings: string[] = [];
  if (v.owner_id !== who) warnings.push(`Bond ${id} is held by ${v.owner_id}, not ${who}. Only the holder can do this.`);
  if (v.vest.exited) warnings.push("This Bond's seal is already broken. There is nothing left in it.");
  if (method === "claim" && BigInt(v.claimable) === ZERO && !v.vest.exited) warnings.push("Nothing is ready to collect yet.");
  const calls: Call[] = [];
  if (!registered) {
    const bounds = await view<{ min: string }>(net, net.consume, "storage_balance_bounds");
    calls.push({
      receiver_id: net.consume,
      method: "storage_deposit",
      args: { registration_only: true },
      deposit_yocto: bounds.min,
      gas_tgas: 10,
      why: `${who} has never held $CONSUME: set the account up to hold it first.`,
    });
  }
  const forfeited = b.if_the_seal_were_broken_now?.forfeited ?? "0";
  calls.push(
    method === "claim"
      ? { receiver_id: net.consume, method, args: { token_id: id }, deposit_yocto: "0", gas_tgas: 50, why: `Collect ${b.consume_ready_to_collect} $CONSUME that Bond ${id} has released.` }
      : { receiver_id: net.consume, method, args: { token_id: id }, deposit_yocto: "1", gas_tgas: 50, why: `Break the seal of Bond ${id}: receive ${b.if_the_seal_were_broken_now?.received ?? "0"} $CONSUME now and forfeit ${forfeited}.` },
  );
  if (method === "exit" && !v.vest.exited) warnings.push(`Breaking the seal cannot be undone. ${forfeited} $CONSUME is forfeited and never minted.`);
  const summary = method === "claim" ? `Collect ${b.consume_ready_to_collect} $CONSUME from Bond ${id}.` : `Break the seal of Bond ${id}: ${b.if_the_seal_were_broken_now?.received ?? "0"} $CONSUME now, ${forfeited} forfeited.`;
  return { who, bond: b, plan: { summary, warnings, calls } as Plan };
}

export const planCollect = (net: Net, args: { account_id?: unknown; bond_id?: unknown }) => planBond(net, args, "claim");
export const planBreakSeal = (net: Net, args: { account_id?: unknown; bond_id?: unknown }) => planBond(net, args, "exit");

export async function planRedeem(net: Net, args: { account_id?: unknown; amount?: unknown }) {
  const who = accountId(args.account_id);
  const raw = toRaw(String(args.amount ?? ""), CONSUME_DECIMALS);
  const [quote, balance] = await Promise.all([quoteRedeem(net, { amount: args.amount }), view<string>(net, net.consume, "ft_balance_of", { account_id: who })]);
  const warnings: string[] = [];
  if (BigInt(balance) < raw) warnings.push(`${who} holds ${consume(balance)} $CONSUME, less than the ${consume(raw)} to burn.`);
  const plan: Plan = {
    summary: `Burn ${consume(raw)} $CONSUME for memecoins worth about $${quote.total_value_usd.toFixed(2)} at the posted prices.`,
    warnings,
    calls: [
      {
        receiver_id: net.consume,
        method: "redeem",
        args: { amount: raw.toString() },
        deposit_yocto: "1",
        gas_tgas: 300,
        why: `Burn ${consume(raw)} $CONSUME and be paid the same share of every memecoin in the Stomach.`,
      },
    ],
  };
  return { who, quote, plan };
}

export async function planTestDeposit(net: Net, args: { account_id?: unknown; symbol?: unknown }) {
  const who = accountId(args.account_id);
  if (net.network !== "testnet" || !net.intents) throw new Error("Test memecoins exist only on testnet, through the NEAR Intents stand-in.");
  const [id, t] = find(await tribes(net), args.symbol);
  if (!t.via_intents) throw new Error(`${t.symbol} is not held on NEAR Intents here.`);
  const call = testDepositCall(net, id, t);
  return { who, plan: { summary: call.why, warnings: [], calls: [call] } as Plan };
}

// ---------- Model Context Protocol ----------

type Schema = { type: "object"; properties: Record<string, { type: string; description: string }>; required?: string[] };
type Args = Record<string, unknown>;
type Tool = { name: string; title: string; description: string; inputSchema: Schema; run: (net: Net, args: Args) => Promise<unknown> };

const NONE: Schema = { type: "object", properties: {} };
const ACCOUNT = { type: "string", description: "The NEAR account that will sign, such as you.testnet" };
const SYMBOL = { type: "string", description: "A listed memecoin, by symbol: DOGE, SHIB, PEPE, PENGU, SPX, TURBO, BOME, BLACKDRAGON, SHITZU or NearKat" };
const AMOUNT = { type: "string", description: "How much of the memecoin, as a plain number of whole tokens. Give this or `usd`." };
const USD = { type: "string", description: "A dollar value to feed at the posted price, such as 25. Give this or `amount`." };
const BOND = { type: "string", description: "The Bond's id, as `account` lists it" };

export const TOOLS: Tool[] = [
  {
    name: "overview",
    title: "CONSUME at a glance",
    description: "What CONSUME is and its state now: the Stomach's value, the backing of each $CONSUME, supply, the tithe, which memecoin is feasting, when the week ends, whether prices are fresh, and the fixed rules. Start here.",
    inputSchema: NONE,
    run: (net) => overview(net),
  },
  {
    name: "list_memecoins",
    title: "The memecoins it eats",
    description: "The listed memecoins: price, price age, per-feeding and daily caps, and how much of each is in the Stomach.",
    inputSchema: NONE,
    run: (net) => memecoins(net),
  },
  {
    name: "feast_race",
    title: "This week's Feast race",
    description: "Standings of the weekly race (most fed memecoin by USD), who is feasting now, and when the week ends. The winner's feedings pay no tithe the following week.",
    inputSchema: NONE,
    run: (net) => feastRace(net),
  },
  {
    name: "quote_feeding",
    title: "Quote a feeding",
    description: "What feeding a memecoin would do right now: how much is accepted, what is refunded over the cap, the tithe, and the $CONSUME in the Bond. Reads only.",
    inputSchema: { type: "object", properties: { symbol: SYMBOL, amount: AMOUNT, usd: USD }, required: ["symbol"] },
    run: (net, a) => quoteFeeding(net, a),
  },
  {
    name: "quote_redeem",
    title: "Quote a redemption",
    description: "What burning an amount of $CONSUME would pay out, memecoin by memecoin. Reads only.",
    inputSchema: { type: "object", properties: { amount: { type: "string", description: "How much $CONSUME to burn, in whole tokens" } }, required: ["amount"] },
    run: (net, a) => quoteRedeem(net, a),
  },
  {
    name: "account",
    title: "What an account holds",
    description: "An account's NEAR, $CONSUME, storage credit, memecoins ready to feed, Bonds (with what is ready to collect and what breaking the seal would give and forfeit) and anything owed from a failed payout.",
    inputSchema: { type: "object", properties: { account_id: { type: "string", description: "A NEAR account, such as you.testnet" } }, required: ["account_id"] },
    run: (net, a) => account(net, a),
  },
  {
    name: "bond",
    title: "One Bond",
    description: "The state of one Bond: holder, what was fed, $CONSUME collected, ready and still locked.",
    inputSchema: { type: "object", properties: { bond_id: BOND }, required: ["bond_id"] },
    run: (net, a) => bond(net, a),
  },
  {
    name: "recent_feedings",
    title: "Recent feedings",
    description: "The latest feedings, newest first, as the Bonds they minted.",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "How many, 1 to 50. Default 12." } } },
    run: (net, a) => recentFeedings(net, a),
  },
  {
    name: "ledger",
    title: "The Ledger",
    description: "The log of every feeding, every $CONSUME minted (a Bond collected from, a seal broken) and every $CONSUME burned (a redemption), newest first, each with its transaction. Also says whether the entries add up to the totals the contract keeps.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Only entries of one kind: feed, collect, break or redeem. Default all." },
        limit: { type: "number", description: "How many, 1 to 200. Default 50." },
      },
    },
    run: (net, a) => ledger(net, a),
  },
  {
    name: "prepare_feed",
    title: "Prepare a feeding",
    description: "Builds the unsigned calls for a feeding, with the quote they rest on: a storage credit top-up if needed, then the transfer that feeds the Stomach and mints a Bond. Signs and sends nothing.",
    inputSchema: {
      type: "object",
      properties: { account_id: ACCOUNT, symbol: SYMBOL, amount: AMOUNT, usd: USD, bring_test_memecoins: { type: "boolean", description: "Testnet only: if the account is short, first bring test memecoins from the stand-in's faucet." } },
      required: ["account_id", "symbol"],
    },
    run: async (net, a) => {
      const p = await planFeed(net, a);
      return planned(net, p.who, p.plan, { quote: p.quote, sign_before: p.sign_before });
    },
  },
  {
    name: "prepare_collect",
    title: "Prepare a collection",
    description: "Builds the unsigned call that collects the $CONSUME a Bond has released so far. Signs and sends nothing.",
    inputSchema: { type: "object", properties: { account_id: ACCOUNT, bond_id: BOND }, required: ["account_id", "bond_id"] },
    run: async (net, a) => {
      const p = await planCollect(net, a);
      return planned(net, p.who, p.plan, { bond: p.bond });
    },
  },
  {
    name: "prepare_break_seal",
    title: "Prepare breaking a seal",
    description: "Builds the unsigned call that breaks a Bond's seal: the holder receives what has been released plus half of what is still locked, and the other half is forfeited for good. Signs and sends nothing.",
    inputSchema: { type: "object", properties: { account_id: ACCOUNT, bond_id: BOND }, required: ["account_id", "bond_id"] },
    run: async (net, a) => {
      const p = await planBreakSeal(net, a);
      return planned(net, p.who, p.plan, { bond: p.bond });
    },
  },
  {
    name: "prepare_redeem",
    title: "Prepare a redemption",
    description: "Builds the unsigned call that burns $CONSUME for its share of every memecoin in the Stomach, with the quote. Signs and sends nothing.",
    inputSchema: { type: "object", properties: { account_id: ACCOUNT, amount: { type: "string", description: "How much $CONSUME to burn, in whole tokens" } }, required: ["account_id", "amount"] },
    run: async (net, a) => {
      const p = await planRedeem(net, a);
      return planned(net, p.who, p.plan, { quote: p.quote });
    },
  },
  {
    name: "prepare_test_deposit",
    title: "Prepare a test deposit",
    description: "Testnet only. Builds the unsigned call that credits free test memecoins to the account's NEAR Intents balance (once an hour per memecoin), so there is something to feed. Signs and sends nothing.",
    inputSchema: { type: "object", properties: { account_id: ACCOUNT, symbol: SYMBOL }, required: ["account_id", "symbol"] },
    run: async (net, a) => {
      const p = await planTestDeposit(net, a);
      return planned(net, p.who, p.plan);
    },
  },
];

export const SERVER = { name: "consume", title: "CONSUME", version: "0.1.0" };
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS =
  "CONSUME is a memecoin on NEAR that eats other memecoins. Call `overview` first. The quote_* and read tools only read the contract. The prepare_* tools return unsigned calls and near CLI lines: this server never holds a key, signs or sends, so the account's own wallet does that. Amounts are whole tokens as plain numbers, dollars are USD at the prices the contract holds.";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Args; protocolVersion?: string } };

/** Answers one JSON-RPC message. Returns null for a notification, which gets no answer. */
export async function handleMcp(net: Net, msg: unknown): Promise<object | null> {
  const m = (msg ?? {}) as Rpc;
  const id = m.id ?? null;
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(-32600, "Not a JSON-RPC 2.0 request");
  if (m.id === undefined) return null; // notifications/initialized and the like
  const ok = (result: object) => ({ jsonrpc: "2.0", id, result });
  switch (m.method) {
    case "initialize": {
      const asked = m.params?.protocolVersion;
      return ok({
        protocolVersion: asked && PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: TOOLS.map(({ name, title, description, inputSchema }) => ({
          name,
          title,
          description,
          inputSchema,
          // every tool only reads the chain: the prepare tools build calls and send nothing
          annotations: { title, readOnlyHint: true, openWorldHint: true },
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === m.params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${m.params?.name}`);
      try {
        const out = await tool.run(net, m.params?.arguments ?? {});
        return ok({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        return ok({ content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${m.method}`);
  }
}
