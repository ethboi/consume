"use client";

// "From any chain": where the ten memecoins live, how NEAR Intents brings them
// to NEAR, and a live check that each one is routable right now.

import { HERESIES } from "@/lib/heresies";
import { useLive } from "@/lib/live";
import { INTENTS_CONTRACT, MOCK_INTENTS } from "@/lib/near";
import { Coin } from "./Coin";
import { Ouroboros } from "./Ouroboros";

type Route = { symbol: string; chain: string; open: boolean; outUsd: number | null; seconds: number | null };

const CHAINS = ["Dogecoin", "Ethereum", "Solana", "NEAR"] as const;

export function Chains() {
  // refresh every 5 minutes, matching the server cache
  const live = useLive("routes", () => fetch("/api/routes").then((r) => r.json() as Promise<{ checkedAt: number; routes: Route[] }>), 300_000);
  const routes = live.data?.routes ?? [];
  const checked = live.data ? new Date(live.data.checkedAt) : null;
  const openCount = routes.filter((r) => r.open).length;

  return (
    <div className="chains">
      <figure className="chain-map" aria-label="Memecoins from four chains reach the Stomach through NEAR Intents">
        <div className="chain-row">
          {CHAINS.map((c) => (
            <div key={c} className="chain-card">
              <span className="chain-name">{c}</span>
              <span className="chain-coins">
                {HERESIES.filter((h) => h.chain === c).map((h) => (
                  <Coin key={h.symbol} symbol={h.symbol} size={38} />
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="chain-arrows" aria-hidden="true">
          {CHAINS.map((c) => (
            <span key={c} />
          ))}
        </div>
        <div className="intents-band">NEAR Intents</div>
        <div className="chain-arrows single" aria-hidden="true">
          <span />
        </div>
        <div className="chain-stomach">
          <span className="roundel">
            <Ouroboros size={64} detailed={false} title="" />
          </span>
          <span>The Stomach, one contract on NEAR</span>
        </div>
        {MOCK_INTENTS && (
          <figcaption className="hint">
            NEAR Intents has no testnet, so here it is a stand-in contract{INTENTS_CONTRACT ? ` (${INTENTS_CONTRACT})` : ""} with the same
            calls. Arrivals and withdrawals are simulated; feeding and redeeming are real.
          </figcaption>
        )}
      </figure>

      <div className="routes">
        <h3>Live routes</h3>
        <p className="hint">
          A free price check through NEAR Intents for each memecoin: $100 in, what comes out in USDC.
          {checked && ` Checked at ${checked.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`}
        </p>
        {live.error ? (
          <p className="hint">Could not reach NEAR Intents just now.</p>
        ) : !live.data ? (
          <p className="hint">Asking NEAR Intents…</p>
        ) : (
          <>
            <p className="routes-sum">
              <strong>
                {openCount} of {routes.length}
              </strong>{" "}
              routes open
            </p>
            <ul>
              {routes.map((r) => (
                <li key={r.symbol} className={r.open ? "" : "shut"}>
                  <Coin symbol={r.symbol} size={24} />
                  <span className="s">{r.symbol}</span>
                  <span className="c">{r.chain}</span>
                  <span className="o">{r.open && r.outUsd !== null ? `$${r.outUsd.toFixed(2)}` : "no route"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
