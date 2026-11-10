"use client";

// "From any chain": where the ten memecoins live, how NEAR Intents brings them
// to NEAR, and under each one a live check that it is routable right now.

import { HERESIES } from "@/lib/heresies";
import { useLive } from "@/lib/live";
import { DEMO, INTENTS_CONTRACT, MOCK_INTENTS } from "@/lib/near";
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
  const routeFor = (symbol: string) => routes.find((r) => r.symbol === symbol);

  return (
    <div className="chains">
      <figure className="chain-map" aria-label="Memecoins travel from four chains through NEAR Intents to the Stomach, and redemptions travel back the same way">
        <p className="routes-line" aria-live="polite">
          {live.error ? (
            "Could not reach NEAR Intents for prices just now."
          ) : !live.data ? (
            "Asking NEAR Intents for prices…"
          ) : (
            <>
              <strong>
                {openCount} of {routes.length} routes open.
              </strong>{" "}
              Under each memecoin: what $100 of it fetches in USDC through NEAR Intents
              {checked ? `, checked at ${checked.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}.
            </>
          )}
        </p>
        <div className="chain-row">
          {CHAINS.map((c) => (
            <div key={c} className="chain-card">
              <span className="chain-name">{c}</span>
              <span className="chain-coins">
                {HERESIES.filter((h) => h.chain === c).map((h) => {
                  const r = routeFor(h.symbol);
                  return (
                    <span key={h.symbol} className="chain-coin">
                      <Coin symbol={h.symbol} size={48} />
                      <span>{h.symbol}</span>
                      <span className={r && !r.open ? "out shut" : "out"}>
                        {!r ? " " : r.open && r.outUsd !== null ? `$${r.outUsd.toFixed(2)}` : "no route"}
                      </span>
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
        <div className="chain-arrows" aria-hidden="true">
          {CHAINS.map((c) => (
            <span key={c} />
          ))}
          <em className="leg l">in</em>
          <em className="leg r">home</em>
        </div>
        <div className="intents-band">NEAR Intents</div>
        <div className="chain-arrows single" aria-hidden="true">
          <span />
          <em className="leg l">feed</em>
          <em className="leg r">redeem</em>
        </div>
        <div className="chain-stomach">
          <span className="roundel">
            <Ouroboros size={80} title="" />
          </span>
          <span>
            The Stomach
            <small>one contract on NEAR</small>
          </span>
        </div>
        {MOCK_INTENTS && !DEMO && (
          <figcaption className="hint">
            NEAR Intents has no testnet, so here it is a stand-in contract{INTENTS_CONTRACT ? ` (${INTENTS_CONTRACT})` : ""} with the same
            calls. Arrivals and withdrawals are simulated; feeding and redeeming are real.
          </figcaption>
        )}
      </figure>
    </div>
  );
}
