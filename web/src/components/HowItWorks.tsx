"use client";

// The "How it works" page: the Rule, then the roads memecoins arrive by. Both
// were sections of the home page until it grew too long.

import { DEMO, type Snapshot } from "@/lib/near";
import { Chains } from "./Chains";
import { BookEmblem, CompassEmblem } from "./Emblems";
import { Colophon, PageHead } from "./Page";
import { Rule } from "./Rule";

export function HowItWorks({ initial, loadError }: { initial: Snapshot; loadError: string | null }) {
  return (
    <div className="folio">
      <PageHead here="/how-it-works" />
      <h1 className="sr-only">How CONSUME works</h1>
      {DEMO && <p className="demo-note">A preview with sample figures. This build is not joined to a contract.</p>}
      {loadError !== null && (
        <p className="demo-note" role="status" title={loadError}>
          Could not read the contract just now, so nobody is named below. The rules are the ones it launched with.
        </p>
      )}

      <section className="chapter band band-ink invert" id="rule" aria-labelledby="rule-h">
        <header>
          <BookEmblem />
          <h2 id="rule-h">The Rule</h2>
          <p>All enforced by the contract.</p>
        </header>
        <Rule snap={initial} />
      </section>

      <section className="chapter" id="chains" aria-labelledby="chains-h">
        <header>
          <CompassEmblem />
          <h2 id="chains-h">From any chain</h2>
          <p>NEAR Intents brings memecoins from Dogecoin, Ethereum and Solana to NEAR, so one contract can eat them all.</p>
        </header>
        <Chains />
      </section>

      <Colophon />
    </div>
  );
}
