// What the chain tests use to talk to the sandbox directly, past the site:
// reading the contracts' own views, sending a transaction as a sandbox account,
// and the test wallet the page is given.

import type { Page } from "@playwright/test";

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Run the tests with: node e2e/run.mjs chain`);
  return v;
};

export const RPC_URL = need("E2E_RPC_URL");
export const HARNESS_URL = need("E2E_HARNESS_URL");
export const CONSUME = need("E2E_CONSUME");
export const INTENTS = need("E2E_INTENTS");
export const ALICE = "alice.test.near";
export const BOB = "bob.test.near";

export const TGAS = (n: number) => (BigInt(n) * BigInt(10) ** BigInt(12)).toString();
export const ONE_YOCTO = "1";

/** A view call on the sandbox, answered by the contract itself. */
export async function view<T>(contract: string, method: string, args: object = {}): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "e2e",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: contract,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const json = (await res.json()) as { result?: { result?: number[]; error?: string }; error?: unknown };
  if (!json.result?.result) throw new Error(`${contract}.${method}: ${JSON.stringify(json.result?.error ?? json.error)}`);
  return JSON.parse(Buffer.from(json.result.result).toString()) as T;
}

export type Action = { type: "FunctionCall"; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } };
export type Transaction = { receiverId: string; actions: Action[] };
export type Outcome = {
  transaction: { hash: string };
  status: Record<string, unknown>;
  receipts_outcome: { outcome: { executor_id: string; logs: string[]; status: Record<string, unknown> } }[];
};

async function harness<T>(path: string, body: object = {}): Promise<T> {
  const res = await fetch(`${HARNESS_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `The harness answered ${res.status}`);
  return json;
}

/** Sign and send as a sandbox account; resolves to each finished transaction. */
export async function send(signer: string, transactions: Transaction[]): Promise<Outcome[]> {
  return (await harness<{ outcomes: Outcome[] }>("/send", { signer, transactions })).outcomes;
}

/** The hash of every transaction sent on this chain since launch, oldest first. */
export async function sentHashes(): Promise<string[]> {
  return (await harness<{ hashes: string[] }>("/sent")).hashes;
}

export const call = (methodName: string, args: Record<string, unknown>, deposit = "0", gas = TGAS(100)): Action => ({
  type: "FunctionCall",
  params: { methodName, args, gas, deposit },
});

/** What every CONSUME event with this name said, across finished transactions. */
export function events<T>(outcomes: Outcome[], event: string): T[] {
  const out: T[] = [];
  for (const o of outcomes) {
    for (const r of o.receipts_outcome) {
      if ("Failure" in r.outcome.status) continue;
      for (const log of r.outcome.logs) {
        if (!log.startsWith("EVENT_JSON:")) continue;
        const j = JSON.parse(log.slice("EVENT_JSON:".length)) as { standard?: string; event?: string; data?: T[] };
        if (j.standard === "consume" && j.event === event && j.data?.[0]) out.push(j.data[0]);
      }
    }
  }
  return out;
}

export type TestWallet = {
  /** Every signing request, including refusals and failed requests. */
  requested: { transactions: Transaction[]; signerId?: string }[];
  /** Every request the site made of the wallet that was signed, oldest first: the transactions asked for, and what came of them. */
  signed: { transactions: Transaction[]; outcomes: Outcome[] }[];
  /** The next request is turned down, the way a person presses Reject. */
  refuseNext: () => void;
  /** Switch the wallet's actual signer without a page reload. */
  switchAccount: (accountId: string | null) => Promise<void>;
  /** Change on-chain state after the site's preflight but before execution. */
  beforeNextSign: (callback: () => Promise<void>) => void;
  /** The last signed request. */
  last: () => { transactions: Transaction[]; outcomes: Outcome[] };
};

/**
 * Gives the page a wallet for one sandbox account. It announces itself the way
 * a browser-extension wallet does (the `near-wallet-injected` event of
 * @hot-labs/near-connect), so the site finds it in its own wallet picker and
 * every signature goes through the site's real wallet code. What it is asked to
 * sign is sent to the sandbox by the stage, which holds the account's key.
 */
export async function giveWallet(page: Page, accountId: string): Promise<TestWallet> {
  const state: { refuse: boolean; signer: string | null; before?: () => Promise<void> } = { refuse: false, signer: accountId };
  const wallet: TestWallet = {
    requested: [],
    signed: [],
    refuseNext: () => {
      state.refuse = true;
    },
    switchAccount: async (next) => {
      state.signer = next;
      await page.evaluate((account) => {
        (window as unknown as { __e2eSwitchAccount: (account: string | null) => void }).__e2eSwitchAccount(account);
      }, next);
    },
    beforeNextSign: (callback) => { state.before = callback; },
    last: () => wallet.signed[wallet.signed.length - 1],
  };

  await page.exposeFunction("__e2eSign", async (transactions: Transaction[], signerId?: string) => {
    wallet.requested.push({ transactions, signerId });
    if (state.refuse) {
      state.refuse = false;
      throw new Error("User rejected the request");
    }
    const before = state.before;
    state.before = undefined;
    await before?.();
    if (!state.signer) throw new Error("Wallet is disconnected");
    const outcomes = await send(state.signer, transactions);
    wallet.signed.push({ transactions, outcomes });
    return outcomes;
  });

  await page.addInitScript((account: string) => {
    type Tx = { receiverId: string; actions: unknown[]; signerId?: string };
    const sign = (window as unknown as { __e2eSign: (txs: Tx[], signerId?: string) => Promise<unknown[]> }).__e2eSign;
    const KEY = "e2e-wallet-signed-in";
    let active: string | null = account;
    (window as unknown as { __e2eSwitchAccount: (account: string | null) => void }).__e2eSwitchAccount = (next) => { active = next; };
    const accounts = () => (localStorage.getItem(KEY) && active ? [{ accountId: active, publicKey: "ed25519:11111111111111111111111111111111" }] : []);
    const testWallet = {
      manifest: {
        id: "e2e-wallet",
        name: "Test wallet",
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
        description: "Signs with a key that exists only on the local sandbox.",
        website: "https://example.org",
        version: "1.0.0",
        executor: "",
        type: "injected",
        platform: {},
        permissions: {},
        features: { signAndSendTransaction: true, signAndSendTransactions: true, signInWithoutAddKey: true, testnet: true, mainnet: false },
      },
      signIn: async () => {
        localStorage.setItem(KEY, "1");
        return accounts();
      },
      signOut: async () => localStorage.removeItem(KEY),
      getAccounts: async () => accounts(),
      signAndSendTransaction: async (p: Tx) => (await sign([{ receiverId: p.receiverId, actions: p.actions }], p.signerId))[0],
      signAndSendTransactions: async (p: { transactions: Tx[]; signerId?: string }) => sign(p.transactions.map((t) => ({ receiverId: t.receiverId, actions: t.actions })), p.signerId),
      signMessage: async () => {
        throw new Error("The test wallet signs transactions only");
      },
    };
    const announce = () => window.dispatchEvent(new CustomEvent("near-wallet-injected", { detail: testWallet }));
    // the site's wallet connector says when it is listening
    window.addEventListener("near-selector-ready", announce);
  }, accountId);

  return wallet;
}

export { roads, stayLocal } from "./local";
