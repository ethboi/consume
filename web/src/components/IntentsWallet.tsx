"use client";

// The wallet's NEAR Intents balance of the ten memecoins: where test
// memecoins arrive and where redemptions are paid. On testnet the Intents
// stand-in can send them "home" (a simulated withdrawal to the coin's chain).

import { useState } from "react";
import { HERESIES } from "@/lib/heresies";
import { DEMO, INTENTS_CONTRACT, MOCK_INTENTS, cleanError, intentsToken, tokenAccount, view, type Snapshot } from "@/lib/near";
import { compact, fromRaw, usd, usdValue } from "@/lib/format";
import { useLive } from "@/lib/live";
import { Coin } from "./Coin";
import { TGAS, useWallet } from "./Wallet";

type Done = (text: string, hash?: string) => void;

/** Sample rows for the page before the contract is deployed. */
const SAMPLE: Record<string, bigint> = {
  PEPE: BigInt("12400000") * BigInt(10) ** BigInt(18),
  DOGE: BigInt(84_000_000_000),
  BOME: BigInt(41_000) * BigInt(1_000_000),
};

const where = (chain: string) => (chain === "NEAR" ? "a NEAR account" : chain);

export function IntentsWallet({ snap, tick, onDone }: { snap: Snapshot; tick: number; onDone: Done }) {
  const { accountId, send } = useWallet();
  const [open, setOpen] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = useLive(DEMO || !accountId ? null : `${accountId}:intents:${tick}`, async () => {
    const ids = HERESIES.map((h) => intentsToken(tokenAccount(h)));
    const v = await view<string[]>(INTENTS_CONTRACT, "mt_batch_balance_of", { account_id: accountId, token_ids: ids });
    return Object.fromEntries(HERESIES.map((h, i) => [h.symbol, BigInt(v[i] ?? "0")]));
  });
  const balances: Record<string, bigint> = DEMO ? SAMPLE : (live.data ?? {});
  const held = HERESIES.filter((h) => (balances[h.symbol] ?? BigInt(0)) > BigInt(0));

  if (!DEMO && !accountId) return null;

  const sendHome = async (symbol: string) => {
    const h = HERESIES.find((x) => x.symbol === symbol)!;
    const amount = balances[symbol];
    if (!amount || !address.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const [r] = await send([
        {
          receiverId: INTENTS_CONTRACT,
          methodName: "simulate_withdraw",
          args: { token_id: intentsToken(tokenAccount(h)), amount: amount.toString(), to_address: address.trim() },
          deposit: "1",
          gas: TGAS(30),
        },
      ]);
      if (r.failure) throw new Error(r.failure);
      setOpen(null);
      setAddress("");
      onDone(`Sent ${fromRaw(amount, h.decimals)} ${h.symbol} to ${where(h.chain)} (simulated).`, r.hash);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="intents-wallet">
      <div className="iw-head">
        <h3>Your NEAR Intents balance</h3>
        <p className="hint">
          Redeemed memecoins land here.{" "}
          {MOCK_INTENTS ? "Send them home to their own chain (simulated on testnet)." : "Withdraw them to their home chain from any NEAR Intents app."}
        </p>
      </div>
      {live.error ? (
        <p className="error">Could not read your Intents balance.</p>
      ) : held.length === 0 ? (
        <p className="hint">{live.loading ? "Reading your balance…" : "Nothing here yet."}</p>
      ) : (
        <ul className="iw-list">
          {held.map((h) => {
            const amount = balances[h.symbol];
            const tribe = snap.tribes.find(([k]) => k === tokenAccount(h))?.[1];
            return (
              <li key={h.symbol}>
                <div className="iw-row">
                  <Coin symbol={h.symbol} size={30} />
                  <span className="s">{h.symbol}</span>
                  <span className="n">{compact(amount, h.decimals)}</span>
                  <span className="c">{tribe ? usd(usdValue(amount, h.decimals, tribe.price_e18)) : `from ${h.chain}`}</span>
                  {MOCK_INTENTS && (
                    <button
                      className="small-button"
                      disabled={DEMO || busy}
                      aria-expanded={open === h.symbol}
                      onClick={() => {
                        setOpen(open === h.symbol ? null : h.symbol);
                        setAddress("");
                        setError(null);
                      }}
                    >
                      Send to {where(h.chain)}
                    </button>
                  )}
                </div>
                {open === h.symbol && (
                  <form
                    className="iw-send"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void sendHome(h.symbol);
                    }}
                  >
                    <label htmlFor={`addr-${h.symbol}`}>{h.chain === "NEAR" ? "NEAR account" : `${h.chain} address`}</label>
                    <input
                      id={`addr-${h.symbol}`}
                      autoComplete="off"
                      spellCheck={false}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={h.chain === "Ethereum" ? "0x…" : h.chain === "NEAR" ? "name.testnet" : "address"}
                    />
                    <button className="press" type="submit" disabled={busy || !address.trim()}>
                      {busy ? "Waiting for the wallet" : `Send all ${h.symbol}`}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
