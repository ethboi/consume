"use client";

// "Try as a guest": for a visitor with no NEAR wallet. One press makes a
// testnet account in this browser (lib/guest.ts) and the page carries on as if
// a wallet had connected. Shown on testnet only.

import { useState } from "react";
import { guestOffered } from "@/lib/guest";
import { useWallet } from "./Wallet";

export function GuestButton() {
  const { startGuest } = useWallet();
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  if (!guestOffered) return null;

  const start = async () => {
    setBusy(true);
    setTrouble(null);
    try {
      await startGuest();
    } catch (e) {
      setTrouble(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <span className="guest">
      <button className="text-link" onClick={start} disabled={busy} title="Makes a free testnet account, kept in this browser">
        {busy ? "Making your guest wallet…" : "No wallet? Try as a guest"}
      </button>
      {trouble && (
        <span className="guest-trouble" role="alert">
          {trouble}
        </span>
      )}
    </span>
  );
}
