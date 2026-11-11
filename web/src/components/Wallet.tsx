"use client";

// Wallet connection through @hot-labs/near-connect, loaded only in the browser.
// Exposes the signed-in account and one helper to send function calls.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { NearConnector } from "@hot-labs/near-connect";
import { NETWORK, cleanError } from "@/lib/near";

export type Call = {
  receiverId: string;
  methodName: string;
  args: object;
  /** yoctoNEAR as a string */
  deposit?: string;
  /** gas units as a string */
  gas?: string;
};

type WalletState = {
  accountId: string | null;
  ready: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sends the calls as one wallet approval when possible. Calls in a row to the
   *  same contract travel as one transaction, so they all land or none does.
   *  Resolves, per transaction, to what actually happened on chain: hash, the
   *  log lines of the receipts that succeeded, and any failed receipt. */
  send: (calls: Call[], expectedAccountId?: string) => Promise<TxResult[]>;
};

export type TxResult = { hash: string; logs: string[]; failure?: string };

type Outcome = {
  transaction: { hash: string };
  status?: unknown;
  receipts_outcome?: { outcome: { logs: string[]; status: unknown } }[];
};

function failureOf(status: unknown): string | undefined {
  if (status && typeof status === "object" && "Failure" in status) return cleanError(JSON.stringify((status as { Failure: unknown }).Failure));
  return undefined;
}

const failed = (status: unknown) => !!status && typeof status === "object" && "Failure" in status;

function toResult(o: Outcome): TxResult {
  const receipts = o.receipts_outcome ?? [];
  return {
    hash: o.transaction.hash,
    // a receipt that failed changed nothing, so what it logged before failing did not happen
    logs: receipts.filter((r) => !failed(r.outcome.status)).flatMap((r) => r.outcome.logs),
    failure: failureOf(o.status) ?? receipts.map((r) => failureOf(r.outcome.status)).find(Boolean),
  };
}

/** What every CONSUME event with this name said, in the order they were logged. */
export function eventsData<T>(results: TxResult[], event: string): T[] {
  const out: T[] = [];
  for (const r of results) {
    for (const l of r.logs) {
      if (!l.startsWith("EVENT_JSON:")) continue;
      try {
        const j = JSON.parse(l.slice("EVENT_JSON:".length));
        if (j.standard === "consume" && j.event === event) out.push((j.data?.[0] ?? {}) as T);
      } catch {
        // not ours
      }
    }
  }
  return out;
}

/** What the first CONSUME event with this name said, or null if none was logged. */
export function eventData<T>(results: TxResult[], event: string): T | null {
  return eventsData<T>(results, event)[0] ?? null;
}

const Ctx = createContext<WalletState | null>(null);

const TGAS = (n: number) => (BigInt(n) * BigInt(1_000_000_000_000)).toString();
const WALLET_CHANGED = "Your wallet changed or disconnected. Reconnect and review the transaction again.";

export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const c = new NearConnector({ network: NETWORK });
      connector.current = c;
      c.on("wallet:signIn", (t) => alive && setAccountId(t.accounts[0]?.accountId ?? null));
      c.on("wallet:signOut", () => alive && setAccountId(null));
      try {
        const { accounts } = await c.getConnectedWallet();
        if (alive) setAccountId(accounts[0]?.accountId ?? null);
      } catch {
        // not signed in yet
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const connect = useCallback(async () => {
    try {
      await connector.current?.connect();
    } catch (e) {
      // closing the wallet picker without choosing is not an error; anything else is worth a line
      if (!(e instanceof Error && e.message === "User rejected")) console.warn("The wallet did not connect:", e);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await connector.current?.disconnect();
    setAccountId(null);
  }, []);

  const send = useCallback(async (calls: Call[], expectedAccountId = accountId) => {
    const c = connector.current;
    if (!c) throw new Error("The wallet is still loading. Try again in a moment.");
    // RPC preflights and the wallet picker can outlive the account that reviewed
    // the action. Ask the wallet again, then pin that signer in the request too.
    // Reading the connection also avoids wallet() clearing its selection when
    // an extension temporarily returns no accounts during a disconnect.
    const { wallet, accounts } = await c.getConnectedWallet().catch((error: unknown) => {
      if (error instanceof Error && ["No accounts found", "No wallet selected"].includes(error.message))
        throw new Error(WALLET_CHANGED);
      throw error;
    });
    if (!expectedAccountId || accounts[0]?.accountId !== expectedAccountId)
      throw new Error(WALLET_CHANGED);
    const action = (call: Call) => ({
      type: "FunctionCall" as const,
      params: {
        methodName: call.methodName,
        args: call.args as Record<string, unknown>,
        gas: call.gas ?? TGAS(100),
        deposit: call.deposit ?? "0",
      },
    });
    const transactions: { receiverId: string; actions: ReturnType<typeof action>[] }[] = [];
    for (const call of calls) {
      const last = transactions[transactions.length - 1];
      if (last && last.receiverId === call.receiverId) last.actions.push(action(call));
      else transactions.push({ receiverId: call.receiverId, actions: [action(call)] });
    }
    try {
      if (transactions.length === 1) {
        const r = await wallet.signAndSendTransaction({ ...transactions[0], signerId: expectedAccountId });
        return [toResult(r as unknown as Outcome)];
      }
      const rs = await wallet.signAndSendTransactions({ transactions, signerId: expectedAccountId });
      return rs.map((r) => toResult(r as unknown as Outcome));
    } catch (e) {
      throw new Error(cleanError(e));
    }
  }, [accountId]);

  return <Ctx.Provider value={{ accountId, ready, connect, disconnect, send }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}

export { TGAS };
