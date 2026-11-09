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
  /** Sends the calls as one wallet approval when possible. Resolves to tx hashes. */
  send: (calls: Call[]) => Promise<string[]>;
};

const Ctx = createContext<WalletState | null>(null);

const TGAS = (n: number) => (BigInt(n) * BigInt(1_000_000_000_000)).toString();

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
    await connector.current?.connect();
  }, []);

  const disconnect = useCallback(async () => {
    await connector.current?.disconnect();
    setAccountId(null);
  }, []);

  const send = useCallback(async (calls: Call[]) => {
    const c = connector.current;
    if (!c) throw new Error("The wallet is still loading. Try again in a moment.");
    const wallet = await c.wallet();
    const transactions = calls.map((call) => ({
      receiverId: call.receiverId,
      actions: [
        {
          type: "FunctionCall" as const,
          params: {
            methodName: call.methodName,
            args: call.args as Record<string, unknown>,
            gas: call.gas ?? TGAS(100),
            deposit: call.deposit ?? "0",
          },
        },
      ],
    }));
    try {
      if (transactions.length === 1) {
        const r = await wallet.signAndSendTransaction(transactions[0]);
        return [r.transaction.hash];
      }
      const rs = await wallet.signAndSendTransactions({ transactions });
      return rs.map((r) => r.transaction.hash);
    } catch (e) {
      throw new Error(cleanError(e));
    }
  }, []);

  return <Ctx.Provider value={{ accountId, ready, connect, disconnect, send }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}

export { TGAS };
