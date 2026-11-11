// A price round: the prices the Assayer posted with `set_prices`, and beside
// them the quotes it says it read.
//
// The contract's `set_prices` takes one argument, `prices`. The Assayer sends a
// second one in the same call, `round`: the NEAR Intents (1Click) quote and the
// 1Click list price it read for each memecoin, and when. The contract has no
// such parameter, so it ignores it (contracts/integration-tests/tests/round.rs
// proves that on the live code). The quotes are therefore the Assayer's own
// account, written into a public transaction where it cannot be changed later.
// They are not proof of what 1Click answered. What they make checkable:
//   - each posted price is exactly the quote the Assayer wrote down;
//   - that quote can be held against the 1Click list price in the same round,
//     and against what 1Click answers anyone who asks at about that time.
//
// The latest round is found through the same public indexer the Ledger uses
// (FastNEAR's transactions API, no key): the Assayer's own transactions.
//
// Like ledger.ts, this file is run by Node as it stands (scripts/assayer.mjs,
// agents/), so it imports nothing from the site and uses no BigInt literals.

import { post, type LedgerNet } from "./ledger.ts";

/** What the Assayer read for one memecoin, in USD per whole token. Numbers as text, so no digit is lost. */
export type RoundQuote = { symbol: string; token: string; quoted_usd: string; listed_usd: string };
export type RoundNote = { read_at: string; source: string; quotes: RoundQuote[] };

export const ROUND_SOURCE =
  "NEAR Intents 1Click on mainnet. quoted_usd: a dry quote of $100 of the memecoin into USDC, per whole token. listed_usd: the 1Click list price. Each posted price is quoted_usd times 1e18.";

/** USD per whole token as the contract wants it: scaled by 1e18. */
export function e18(price: number): string {
  // keep the digits of very small prices; large ones would pass what a double holds exactly
  return (
    price * 1e18 < Number.MAX_SAFE_INTEGER ? BigInt(Math.round(price * 1e18)) : BigInt(Math.round(price * 1e12)) * BigInt(1_000_000)
  ).toString();
}

/** A price in dollars to six figures, however small: $0.00000000664791, never 6.6e-9. */
export function priceText(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  return `$${usd.toFixed(Math.min(20, Math.max(2, 5 - Math.floor(Math.log10(usd)))))}`;
}

/** The arguments of one `set_prices` call: the prices, and the quotes they came from. */
export function roundArgs(
  rows: { symbol: string; token: string; price: number; listed: number }[],
  readAt: Date,
): { prices: [string, string][]; round: RoundNote } {
  return {
    prices: rows.map((r): [string, string] => [r.token, e18(r.price)]),
    round: {
      read_at: readAt.toISOString(),
      source: ROUND_SOURCE,
      quotes: rows.map((r) => ({ symbol: r.symbol, token: r.token, quoted_usd: String(r.price), listed_usd: String(r.listed) })),
    },
  };
}

export type RoundPrice = {
  token: string;
  /** As the Assayer named it. Null in a round without quotes. */
  symbol: string | null;
  /** What the contract was given, and the same in USD per whole token. */
  posted_e18: string;
  posted_usd: number;
  /** What the Assayer says it read. Null in a round without quotes. */
  quoted_usd: number | null;
  listed_usd: number | null;
  /** True when the posted price is exactly the quote, scaled the way the Assayer scales it. */
  posted_is_the_quote: boolean | null;
  /** How far the quote is from the list price, in percent of the list price. */
  quote_from_list_percent: number | null;
};

export type Round = {
  /** Transaction hash. */
  tx: string;
  /** When the transaction entered a block. */
  at: string;
  /** Who signed it, and the contract it was sent to. */
  feeder: string;
  contract: string;
  /** False for a round sent before the Assayer wrote its quotes down. */
  with_quotes: boolean;
  /** When the Assayer says it read the quotes, and what it says they are. */
  read_at: string | null;
  source: string | null;
  prices: RoundPrice[];
};

/** A transaction as the indexer gives it. */
export type RoundTx = {
  transaction: { hash: string; signer_id?: string; receiver_id?: string; actions?: unknown[] };
  execution_outcome?: { block_timestamp?: number | string };
};

const text = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const positive = (v: unknown): number | null => {
  const n = typeof v === "string" && v.length <= 40 ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

function decode(args: unknown): unknown {
  if (typeof args !== "string") return null;
  try {
    const bytes = Uint8Array.from(atob(args), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** The round in one transaction, or null if it is not a `set_prices` call to this contract. */
export function parseRound(tx: RoundTx, consume: string): Round | null {
  const t = tx.transaction;
  if (!t || t.receiver_id !== consume || !Array.isArray(t.actions)) return null;
  const call = t.actions
    .map((a) => (a && typeof a === "object" ? (a as { FunctionCall?: { method_name?: unknown; args?: unknown } }).FunctionCall : undefined))
    .find((c) => c?.method_name === "set_prices");
  if (!call) return null;
  const args = decode(call.args) as { prices?: unknown; round?: { read_at?: unknown; source?: unknown; quotes?: unknown } } | null;
  if (!args || !Array.isArray(args.prices)) return null;
  const posted = args.prices.filter((p): p is [string, string] => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string" && /^\d{1,60}$/.test(p[1]));
  if (posted.length === 0 || posted.length !== args.prices.length) return null;

  const quotes = new Map<string, { symbol: string | null; quoted: number; listed: number }>();
  const note = args.round && typeof args.round === "object" ? args.round : null;
  if (note && Array.isArray(note.quotes)) {
    for (const q of note.quotes as Record<string, unknown>[]) {
      if (!q || typeof q !== "object") continue;
      const [token, quoted, listed] = [text(q.token), positive(q.quoted_usd), positive(q.listed_usd)];
      if (token && quoted !== null && listed !== null) quotes.set(token, { symbol: text(q.symbol, 40), quoted, listed });
    }
  }
  // quotes count only when there is one for every posted price
  const withQuotes = posted.every(([token]) => quotes.has(token));
  const at = Number(tx.execution_outcome?.block_timestamp);
  return {
    tx: t.hash,
    at: Number.isFinite(at) && at > 0 ? new Date(Math.floor(at / 1e6)).toISOString() : "",
    feeder: t.signer_id ?? "",
    contract: consume,
    with_quotes: withQuotes,
    read_at: withQuotes ? text(note?.read_at, 40) : null,
    source: withQuotes ? text(note?.source, 400) : null,
    prices: posted.map(([token, raw]) => {
      const q = withQuotes ? quotes.get(token)! : null;
      return {
        token,
        symbol: q?.symbol ?? null,
        posted_e18: raw,
        posted_usd: Number(raw) / 1e18,
        quoted_usd: q ? q.quoted : null,
        listed_usd: q ? q.listed : null,
        posted_is_the_quote: q ? e18(q.quoted) === raw : null,
        quote_from_list_percent: q ? Math.round(((q.quoted - q.listed) / q.listed) * 1e4) / 100 : null,
      };
    }),
  };
}

/** How many of the feeder's newest transactions are looked at for a round. */
const LOOK = 10;
const TTL_MS = 30_000;

async function load(net: LedgerNet, feeder: string): Promise<Round | null> {
  const found = await post<{ account_txs: { transaction_hash: string; is_success: boolean }[] }>(net, "/v0/account", {
    account_id: feeder,
    desc: true,
    limit: LOOK,
    is_signer: true,
  });
  const hashes = found.account_txs.filter((r) => r.is_success).map((r) => r.transaction_hash).slice(0, LOOK);
  if (hashes.length === 0) return null;
  const got = await post<{ transactions: RoundTx[] }>(net, "/v0/transactions", { tx_hashes: hashes });
  const byHash = new Map(got.transactions.map((tx) => [tx.transaction.hash, tx]));
  for (const hash of hashes) {
    const tx = byHash.get(hash);
    // only what the feeder itself signed is a round of its own
    const round = tx && tx.transaction.signer_id === feeder ? parseRound(tx, net.consume) : null;
    if (round) return round;
  }
  return null;
}

const kept = new Map<string, { at: number; round: Promise<Round | null> }>();

/**
 * The newest price round the feeder posted to this contract, or null when none
 * is among its last few transactions. Kept for half a minute.
 */
export function latestRound(net: LedgerNet, feeder: string): Promise<Round | null> {
  const key = `${net.network}:${net.consume}:${feeder}`;
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.round;
  const round = load(net, feeder);
  kept.set(key, { at: Date.now(), round });
  while (kept.size > 16) kept.delete(kept.keys().next().value!);
  round.catch(() => {
    if (kept.get(key)?.round === round) kept.delete(key);
  });
  return round;
}
