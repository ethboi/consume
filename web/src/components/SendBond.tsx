"use client";

import { useState, type FormEvent } from "react";
import { accountExists, cleanError, CONSUME_CONTRACT, DEMO, NETWORK, view, type VestView } from "@/lib/near";
import { fromRaw } from "@/lib/format";
import { TGAS, useWallet, type Call } from "./Wallet";

// Matches the reserve in contracts/consume/src/standards.rs (1,024 bytes).
const TRANSFER_RESERVE = BigInt("10240000000000000000000");
const CREDIT_TOP_UP = "100000000000000000000000";
type Review = { recipient: string; sender: string; topUp: boolean };

export function SendBond({ bond, disabled, onBusy, onDone }: {
  bond: VestView;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onDone: (text: string, hash?: string) => void;
}) {
  const { accountId, send } = useWallet();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accountId || DEMO || busy || disabled) return;
    setError(null);
    setBusy(true);
    onBusy(true);
    try {
      const receiver = review?.recipient ?? recipient.trim();
      if (receiver.length < 2 || receiver.length > 64 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(receiver))
        throw new Error("Enter a complete NEAR account in lowercase, such as friend.testnet.");
      if (receiver === accountId) throw new Error("Choose another account. You already hold this Bond.");
      if (receiver === CONSUME_CONTRACT) throw new Error("Send to the recipient’s wallet, not the CONSUME contract.");
      if (review && review.sender !== accountId) {
        setReview(null);
        throw new Error("Your wallet changed. Review the recipient again.");
      }
      const [exists, current, credit] = await Promise.all([
        accountExists(receiver),
        view<VestView | null>(CONSUME_CONTRACT, "get_vest", { token_id: bond.token_id }),
        view<string>(CONSUME_CONTRACT, "get_meal_credit", { account_id: accountId }),
      ]);
      if (!exists) throw new Error(`That account does not exist on NEAR ${NETWORK}. Check the full address.`);
      if (current?.owner_id !== accountId) throw new Error("This wallet no longer holds the Bond. Refresh your Bonds.");
      const topUp = BigInt(credit) < TRANSFER_RESERVE;
      if (!review || topUp !== review.topUp) {
        setReview({ recipient: receiver, sender: accountId, topUp });
        return;
      }
      const calls: Call[] = [];
      if (topUp) calls.push({ receiverId: CONSUME_CONTRACT, methodName: "add_meal_credit", args: {}, deposit: CREDIT_TOP_UP, gas: TGAS(10) });
      calls.push({ receiverId: CONSUME_CONTRACT, methodName: "nft_transfer", args: { receiver_id: receiver, token_id: bond.token_id }, deposit: "1", gas: TGAS(50) });
      // Both calls target the same contract: Wallet sends them atomically.
      const [result] = await send(calls);
      if (!result) throw new Error("The wallet returned no transaction result. Check your wallet before trying again.");
      if (result.failure) throw new Error(result.failure);
      setOpen(false);
      setReview(null);
      onDone(`Bond ${bond.token_id} sent to ${receiver}. Its remaining payout now belongs to them.`, result.hash);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  if (!open) return <button className="small-button" disabled={DEMO || disabled} onClick={() => { setOpen(true); setError(null); }}>Send this Bond</button>;
  return (
    <form className="bond-send" onSubmit={submit} aria-label={`Send Bond ${bond.token_id}`}>
      <h4>Send Bond № {bond.token_id}</h4>
      {review ? (
        <>
          <p>Send to <strong className="bond-recipient">{review.recipient}</strong> on NEAR {NETWORK}.</p>
          <p>They receive all uncollected and future $CONSUME from this Bond. Your already collected tokens stay with you. The vesting dates stay the same.</p>
          <p><strong>0.01024 NEAR</strong> is spent from your storage credit, plus gas and 1 yoctoNEAR. This transfer reserve is not refundable.
            {review.topUp ? " This transaction first adds 0.1 NEAR of credit; unused credit can be withdrawn in the feeding panel." : " Your existing credit covers the reserve."}</p>
          <p>The recipient may need a separate $CONSUME registration; Collect sets that up. This is a gift or transfer: no payment is collected from them.</p>
        </>
      ) : (
        <>
          <label htmlFor={`send-bond-${bond.token_id}`}>Recipient’s NEAR account</label>
          <input id={`send-bond-${bond.token_id}`} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="friend.testnet" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} disabled={busy || disabled} required />
          <p>{fromRaw(BigInt(bond.vest.total) - BigInt(bond.vest.released), 18, 2)} $CONSUME remains in the position. Sending includes anything already available to collect.</p>
          <p>Costs 0.01024 NEAR of storage credit plus gas. Review the address and any credit top-up before signing.</p>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="small-button" type="submit" disabled={busy || disabled}>{busy ? "Checking or waiting for your wallet…" : review ? "Confirm and send Bond" : "Review transfer"}</button>
        <button className="small-button" type="button" disabled={busy || disabled} onClick={() => { setReview(null); setOpen(false); setError(null); }}>Cancel</button>
      </div>
    </form>
  );
}
