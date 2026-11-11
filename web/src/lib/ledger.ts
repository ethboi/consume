// The Ledger: every feeding, every $CONSUME minted and every $CONSUME burned,
// read back from the contract's own event logs, each with its transaction.
//
// The contract keeps totals but no history, and a NEAR node cannot search
// logs, so the history comes from a public indexer (FastNEAR's transactions
// API, no key). The indexer is trusted for both discovery and receipt contents;
// the client does not verify receipt proofs independently.
//
// How the transactions are found:
//   1. those whose event logs name the contract: every feeding (the memecoin
//      moves to it) and every redemption (memecoins move out of it);
//   2. those in which the contract called another: redemptions again;
//   3. those whose event logs name a feeder or a Bond holder: what they
//      collected and the seals they broke.
// An account that was handed a Bond, collected from it and passed it on again
// is the one case this can miss.
//
// Like mcp.ts, this file is run by Node as it stands (agents/), so it imports
// nothing from the site and uses no BigInt literals.

export type LedgerNet = { network: "testnet" | "mainnet"; consume: string };

export type LedgerEntry = {
  id: string;
  kind: "feed" | "collect" | "break" | "redeem";
  /** True when the account is one of the builder's own (see `Ledger.builder`). */
  by_builder?: boolean;
  /** Transaction hash. */
  tx: string;
  /** When the contract ran it, in milliseconds. */
  at: number;
  account: string;
  /** Bond number (feed, collect, break). */
  bond?: string;
  /** feed: the memecoin's token id, the amount taken, its worth and the tithe in micro-USD. */
  token?: string;
  amount?: string;
  usd?: string;
  tithe_usd?: string;
  feast?: boolean;
  /** feed: $CONSUME written into the Bond. None of it is minted until it is collected. */
  locked?: string;
  /** collect, break: $CONSUME minted. */
  minted?: string;
  /** break: $CONSUME given up, which is never minted. */
  forfeited?: string;
  /** redeem: $CONSUME burned, and the memecoins paid for it as [token id, amount]. */
  burned?: string;
  shares?: [string, string][];
};

/** How many, the builder's own accounts apart from everyone else's. */
export type Split = { builder: number; others: number };

export type Ledger = {
  /** Newest first. */
  entries: LedgerEntry[];
  /**
   * The builder's account. It and every account under it count as the
   * builder's own. Null when there is nothing to tell them by.
   */
  builder: string | null;
  /** Feedings among the entries, and the distinct accounts that made them. */
  feedings: Split;
  feeders: Split;
  /** True when account/page limits truncated discovery; false is not completeness. */
  discovery_limits_reached: boolean;
  history_completeness: "unknown";
  /** How many feeders and holders were looked up. */
  accounts: number;
  read_at: string;
};

/**
 * Whose deployment this is, read from the contract's own name: the account it
 * sits under (consume.consumecash.testnet is under consumecash.testnet). A
 * contract directly under the network's own name has no such parent, and the
 * answer is null. CONSUME_BUILDER_ACCOUNT names another account instead; the
 * browser tests use it, since every account on a local sandbox has one parent.
 */
export function builderOf(consume: string): string | null {
  const named = process.env.CONSUME_BUILDER_ACCOUNT?.trim();
  if (named) return named;
  const parent = consume.split(".").slice(1).join(".");
  return parent.includes(".") ? parent : null;
}

/** The builder's account itself, or any account under it. */
export const isBuilders = (account: string, builder: string | null): boolean =>
  !!builder && (account === builder || account.endsWith(`.${builder}`));

/** Feedings and the accounts that made them, the builder's own apart from everyone else's. */
export function splitFeedings(entries: LedgerEntry[], builder: string | null): { feedings: Split; feeders: Split } {
  const fed = entries.filter((e) => e.kind === "feed");
  const own = (e: LedgerEntry) => isBuilders(e.account, builder);
  const accounts = (list: LedgerEntry[]) => new Set(list.map((e) => e.account)).size;
  return {
    feedings: { builder: fed.filter(own).length, others: fed.filter((e) => !own(e)).length },
    feeders: { builder: accounts(fed.filter(own)), others: accounts(fed.filter((e) => !own(e))) },
  };
}

const INDEXER = { testnet: "https://tx.test.fastnear.com", mainnet: "https://tx.main.fastnear.com" };
/** Another indexer that speaks the same two calls, if CONSUME_INDEXER_URL names one. The browser tests point it at a local sandbox. */
const indexer = (net: LedgerNet) => process.env.CONSUME_INDEXER_URL?.trim() || INDEXER[net.network];
const PAGE = 200; // the most the indexer gives per page
const MAX_PAGES = 5;
const MAX_ACCOUNTS = 25;
const BATCH = 20; // the most transactions the indexer returns per request
const TTL_MS = 30_000;
const TIMEOUT_MS = 9_000;

type Row = { transaction_hash: string; is_success: boolean };
type Outcome = { executor_id: string; logs: string[]; status: Record<string, unknown> | string };
type Tx = {
  transaction: { hash: string };
  receipts: { execution_outcome?: { block_timestamp: number | string; outcome: Outcome } }[];
};

async function post<T>(net: LedgerNet, path: string, body: object): Promise<T> {
  const res = await fetch(`${indexer(net)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "consume-site" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The indexer answered ${res.status}`);
  return (await res.json()) as T;
}

/** Hashes of an account's finished transactions that pass a filter, newest first. */
async function find(net: LedgerNet, account: string, filter: object): Promise<{ hashes: string[]; more: boolean }> {
  const hashes: string[] = [];
  let resume: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = { account_id: account, desc: true, limit: PAGE, ...filter, ...(resume ? { resume_token: resume } : {}) };
    const got = await post<{ account_txs: Row[]; resume_token?: string | null }>(net, "/v0/account", body);
    for (const row of got.account_txs) if (row.is_success) hashes.push(row.transaction_hash);
    if (!got.resume_token || got.account_txs.length < PAGE) return { hashes, more: false };
    resume = got.resume_token;
  }
  return { hashes, more: true };
}

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** What the CONSUME contract logged in one transaction. Logs of a receipt that failed are not counted: nothing in it happened. */
function parse(net: LedgerNet, tx: Tx): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  tx.receipts.forEach((r, ri) => {
    const o = r.execution_outcome?.outcome;
    if (!o || o.executor_id !== net.consume) return;
    if (typeof o.status !== "object" || o.status === null || "Failure" in o.status) return;
    const at = Math.floor(Number(r.execution_outcome!.block_timestamp) / 1e6);
    o.logs.forEach((log, li) => {
      if (!log.startsWith("EVENT_JSON:")) return;
      let ev: { standard?: string; event?: string; data?: Record<string, unknown>[] };
      try {
        ev = JSON.parse(log.slice("EVENT_JSON:".length));
      } catch {
        return;
      }
      const d = ev.data?.[0];
      if (ev.standard !== "consume" || !d) return;
      const base = { id: `${tx.transaction.hash}:${ri}:${li}`, tx: tx.transaction.hash, at };
      if (ev.event === "meal") {
        out.push({
          ...base,
          kind: "feed",
          account: str(d.eater),
          bond: str(d.vest_id),
          token: str(d.tribe),
          amount: str(d.eaten),
          usd: str(d.meal_usd),
          tithe_usd: str(d.tithe_usd),
          locked: str(d.consume),
          feast: d.bonus === true,
        });
      } else if (ev.event === "claim") {
        out.push({ ...base, kind: "collect", account: str(d.owner), bond: str(d.vest_id), minted: str(d.amount) });
      } else if (ev.event === "exit") {
        out.push({ ...base, kind: "break", account: str(d.owner), bond: str(d.vest_id), minted: str(d.payout), forfeited: str(d.forfeited) });
      } else if (ev.event === "redeem") {
        const shares = Array.isArray(d.shares) ? (d.shares as unknown[]) : [];
        out.push({
          ...base,
          kind: "redeem",
          account: str(d.account),
          burned: str(d.burned),
          shares: shares
            .filter((s): s is [unknown, unknown] => Array.isArray(s) && s.length === 2)
            .map(([token, amount]): [string, string] => [str(token), str(amount)])
            .filter(([, amount]) => amount !== "" && amount !== "0"),
        });
      }
    });
  });
  return out;
}

// Bound cached indexer responses; these are not cryptographic receipt proofs.
const read = new Map<string, LedgerEntry[]>();
const MAX_CACHED_TRANSACTIONS = 4096;

async function entriesOf(net: LedgerNet, hashes: string[]): Promise<LedgerEntry[]> {
  const key = (h: string) => `${net.network}:${net.consume}:${h}`;
  // Keep this request's results independently: concurrent cache eviction must
  // not omit already-read entries from its response.
  const found = new Map<string, LedgerEntry[]>();
  for (const h of hashes) {
    const hit = read.get(key(h));
    if (hit) found.set(h, hit);
  }
  const missing = hashes.filter((h) => !found.has(h));
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
  // a few requests at a time
  for (let i = 0; i < batches.length; i += 4) {
    await Promise.all(
      batches.slice(i, i + 4).map(async (batch) => {
        const got = await post<{ transactions: Tx[] }>(net, "/v0/transactions", { tx_hashes: batch });
        for (const tx of got.transactions) {
          const entries = parse(net, tx);
          found.set(tx.transaction.hash, entries);
          read.set(key(tx.transaction.hash), entries);
          // Enforce on every insertion, even if a later batch fails.
          while (read.size > MAX_CACHED_TRANSACTIONS) read.delete(read.keys().next().value!);
        }
      }),
    );
  }
  return hashes.flatMap((h) => found.get(h) ?? []);
}

async function load(net: LedgerNet, holders: string[]): Promise<Ledger> {
  const [named, called] = await Promise.all([find(net, net.consume, { is_event_log: true }), find(net, net.consume, { is_predecessor: true })]);
  const first = await entriesOf(net, [...new Set([...named.hashes, ...called.hashes])]);

  // feeders and redeemers, newest first, then whoever holds a Bond today
  const known = [...new Set([...first.sort((a, b) => b.at - a.at).map((e) => e.account), ...holders])].filter((a) => a && a !== net.consume);
  const accounts = known.slice(0, MAX_ACCOUNTS);
  const theirs: { hashes: string[]; more: boolean }[] = [];
  for (let i = 0; i < accounts.length; i += 5) {
    theirs.push(...(await Promise.all(accounts.slice(i, i + 5).map((a) => find(net, a, { is_event_log: true })))));
  }
  const rest = await entriesOf(net, [...new Set(theirs.flatMap((t) => t.hashes))]);

  const builder = builderOf(net.consume);
  const byId = new Map<string, LedgerEntry>();
  // a copy of each entry: the ones kept per transaction stay as they were read
  for (const e of [...first, ...rest]) byId.set(e.id, isBuilders(e.account, builder) ? { ...e, by_builder: true } : e);
  const entries = [...byId.values()].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  return {
    entries,
    builder,
    ...splitFeedings(entries, builder),
    discovery_limits_reached: named.more || called.more || known.length > MAX_ACCOUNTS || theirs.some((t) => t.more),
    history_completeness: "unknown",
    accounts: accounts.length,
    read_at: new Date().toISOString(),
  };
}

const kept = new Map<string, { at: number; ledger: Promise<Ledger> }>();

/**
 * The Ledger of one deployment, newest first. `holders` are the accounts that
 * hold a Bond now (from the contract), so that what they collected is found.
 * Kept for half a minute, so visitors never hammer the indexer.
 */
export function readLedger(net: LedgerNet, holders: string[] = []): Promise<Ledger> {
  const key = `${net.network}:${net.consume}`;
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ledger;
  const ledger = load(net, holders);
  kept.set(key, { at: Date.now(), ledger });
  while (kept.size > 32) kept.delete(kept.keys().next().value!);
  // a failed reading is not kept: the next visitor asks again
  ledger.catch(() => kept.get(key)?.ledger === ledger && kept.delete(key));
  return ledger;
}
