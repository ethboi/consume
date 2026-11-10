// The Ledger: every feeding, every $CONSUME minted and every $CONSUME burned,
// read back from the contract's own event logs, each with its transaction.
//
// The contract keeps totals but no history, and a NEAR node cannot search
// logs, so the history comes from a public indexer (FastNEAR's transactions
// API, no key). The indexer only finds the transactions. What is shown is
// parsed from the logs the CONSUME contract itself wrote in them, so the
// indexer can leave an entry out but cannot invent one.
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

export type Ledger = {
  /** Newest first. */
  entries: LedgerEntry[];
  /** False when a limit was reached and older entries may be missing. */
  complete: boolean;
  /** How many feeders and holders were looked up. */
  accounts: number;
  read_at: string;
};

const INDEXER = { testnet: "https://tx.test.fastnear.com", mainnet: "https://tx.main.fastnear.com" };
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
  const res = await fetch(`${INDEXER[net.network]}${path}`, {
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

// A finished transaction never changes, so what was read from one is kept.
const read = new Map<string, LedgerEntry[]>();

async function entriesOf(net: LedgerNet, hashes: string[]): Promise<LedgerEntry[]> {
  const key = (h: string) => `${net.network}:${net.consume}:${h}`;
  const missing = hashes.filter((h) => !read.has(key(h)));
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
  // a few requests at a time
  for (let i = 0; i < batches.length; i += 4) {
    await Promise.all(
      batches.slice(i, i + 4).map(async (batch) => {
        const got = await post<{ transactions: Tx[] }>(net, "/v0/transactions", { tx_hashes: batch });
        for (const tx of got.transactions) read.set(key(tx.transaction.hash), parse(net, tx));
      }),
    );
  }
  return hashes.flatMap((h) => read.get(key(h)) ?? []);
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

  const byId = new Map<string, LedgerEntry>();
  for (const e of [...first, ...rest]) byId.set(e.id, e);
  return {
    entries: [...byId.values()].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1)),
    complete: !named.more && !called.more && known.length <= MAX_ACCOUNTS && theirs.every((t) => !t.more),
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
  // a failed reading is not kept: the next visitor asks again
  ledger.catch(() => kept.get(key)?.ledger === ledger && kept.delete(key));
  return ledger;
}
