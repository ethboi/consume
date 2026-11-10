"use client";

// "From any chain", drawn as a road map: four towns where the ten memecoins
// live, their roads meeting at one gate (NEAR Intents), and past the gate the
// Serpent. Under each memecoin is a live check that its road is open right now.

import type { CSSProperties } from "react";
import { HERESIES } from "@/lib/heresies";
import { useLive } from "@/lib/live";
import { DEMO, INTENTS_CONTRACT, MOCK_INTENTS } from "@/lib/near";
import { Coin } from "./Coin";
import { Ouroboros } from "./Ouroboros";

type Route = { symbol: string; chain: string; open: boolean; outUsd: number | null; seconds: number | null };

const CHAINS = ["Dogecoin", "Ethereum", "Solana", "NEAR"] as const;

// The map between the towns and the Serpent, in pixels. The same sizes go to
// the CSS as custom properties, so the drawn roads meet the rows they leave.
const ROW = 100; // height of a town's row
const ROAD = 40; // how far down its row a town's road runs
const MID_W = 340;
const HUB = ROAD + (ROW * (CHAINS.length - 1)) / 2; // where the roads meet
const GATE_X = 160; // the gate's left wall
const END_X = MID_W + 36; // under the Serpent's body
const roadFrom = (i: number) => `M0,${ROAD + ROW * i} C${GATE_X * 0.56},${ROAD + ROW * i} ${GATE_X * 0.44},${HUB} ${GATE_X},${HUB}`;
const SIZES = { "--row": `${ROW}px`, "--road": `${ROAD}px`, "--mid": `${MID_W}px`, "--gate": `${GATE_X}px` } as CSSProperties;

// IM Fell's figures are old-style (its 10 reads as IO), so small counts are spelled out
const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const spell = (n: number) => COUNT[n] ?? String(n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The gatehouse every memecoin passes through. Its doorway sits on the road. */
function Gate() {
  const merlons = (xs: number[], y: number) => xs.map((x) => <rect key={x} x={x} y={y} width={8} height={10} />);
  return (
    <svg className="roads-gate" viewBox="0 0 120 150" aria-hidden="true" fill="var(--paper)" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round">
      {/* pennants */}
      <path d="M20,30 V6 M100,30 V6" />
      <path d="M20,7 L37,12 L20,17 Z M100,7 L117,12 L100,17 Z" fill="var(--rubric)" strokeWidth={1.4} />
      {/* curtain wall, then the two towers in front of it */}
      {merlons([40, 56, 72], 54)}
      <rect x={36} y={63} width={48} height={87} />
      {merlons([2, 16, 30], 30)}
      <rect x={4} y={39} width={32} height={111} />
      {merlons([82, 96, 110], 30)}
      <rect x={84} y={39} width={32} height={111} />
      {/* the doorway and the arrow slits, in the dark */}
      <path d="M45,150 V114 A15,15 0 0 1 75,114 V150 Z" fill="var(--ink)" />
      <path d="M45,114 A15,15 0 0 1 75,114" fill="none" stroke="var(--rubric)" strokeWidth={3} transform="translate(0 -4.5)" />
      <path d="M18,60 h4 v20 h-4 Z M98,60 h4 v20 h-4 Z" fill="var(--ink)" stroke="none" />
      {/* a few courses of stone */}
      <path
        d="M4,96 h14 M22,110 h14 M4,126 h12 M84,100 h13 M102,116 h14 M84,132 h12 M42,78 h12 M62,90 h16 M12,96 v8 M28,110 v8 M92,100 v8 M108,116 v8 M50,78 v7"
        fill="none"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Chains() {
  // refresh every 5 minutes, matching the server cache
  const live = useLive(
    "routes",
    async () => {
      const r = await fetch("/api/routes");
      if (!r.ok) throw new Error(`routes ${r.status}`);
      return (await r.json()) as { checkedAt: number; routes: Route[] };
    },
    300_000,
  );
  const routes = live.data?.routes ?? [];
  const checked = live.data ? new Date(live.data.checkedAt) : null;
  const openCount = routes.filter((r) => r.open).length;
  const routeFor = (symbol: string) => routes.find((r) => r.symbol === symbol);
  // a memecoin walks its road only while that road is open
  const walkers = CHAINS.flatMap((c, i) => HERESIES.filter((h) => h.chain === c && routeFor(h.symbol)?.open).map((h) => ({ h, i })));

  return (
    <figure className="roads" style={SIZES} aria-label="Memecoins travel from four chains through NEAR Intents to the Stomach">
      <p className="roads-status" aria-live="polite">
        {live.error ? (
          "Could not reach NEAR Intents for prices just now."
        ) : !live.data ? (
          "Asking NEAR Intents which roads are open…"
        ) : (
          <>
            <strong>
              {openCount === routes.length
                ? `All ${spell(openCount)} roads are open`
                : `${capital(spell(openCount))} of ${spell(routes.length)} roads are open`}
            </strong>
            {checked ? <span> checked at {checked.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span> : null}
          </>
        )}
      </p>

      <div className="roads-map">
        <div className="roads-towns">
          {CHAINS.map((c) => (
            <div key={c} className="town">
              <span className="town-name">{c}</span>
              <span className="town-coins">
                {HERESIES.filter((h) => h.chain === c).map((h) => {
                  const r = routeFor(h.symbol);
                  return (
                    <span key={h.symbol} className="town-coin">
                      <Coin symbol={h.symbol} size={48} />
                      <span className={h.symbol.length > 8 ? "sym long" : "sym"}>{h.symbol}</span>
                      <span className={r && !r.open ? "out shut" : "out"}>
                        {!r ? " " : r.open && r.outUsd !== null ? `$${r.outUsd.toFixed(2)}` : "no road"}
                      </span>
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>

        <div className="roads-mid">
          <svg className="roads-lines" width={END_X} height={ROW * CHAINS.length} viewBox={`0 0 ${END_X} ${ROW * CHAINS.length}`} aria-hidden="true">
            {CHAINS.map((c, i) => (
              <path key={c} d={roadFrom(i)} />
            ))}
            <path d={`M${GATE_X},${HUB} H${END_X - 12}`} />
          </svg>
          <span className="roads-walkers" aria-hidden="true">
            {walkers.map(({ h, i }, n) => (
              <span
                key={h.symbol}
                style={{ offsetPath: `path("${roadFrom(i)} H${END_X}")`, animationDelay: `${(-n * 12) / Math.max(walkers.length, 1)}s` } as CSSProperties}
              >
                <Coin symbol={h.symbol} size={22} />
              </span>
            ))}
          </span>
          <Gate />
          <p className="roads-gate-name">
            NEAR Intents
            <small>the one gate they all pass</small>
          </p>
        </div>

        <div className="roads-stomach">
          <Ouroboros size={240} title="" />
          <p>
            <span>The</span> Stomach
          </p>
          <small>one contract on NEAR</small>
        </div>
      </div>

      <figcaption className="roads-notes">
        <p>
          Under each memecoin: what $100 of it fetches in USDC (a dollar stablecoin) through NEAR Intents right now, which shows NEAR Intents is trading it.
          Redeemed memecoins are paid to your NEAR Intents balance.
        </p>
        {MOCK_INTENTS && !DEMO && (
          <p>
            NEAR Intents has no testnet, so here it is a stand-in contract{INTENTS_CONTRACT ? ` (${INTENTS_CONTRACT})` : ""} with the same
            calls. Arrivals and withdrawals are simulated; feeding and redeeming are real.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
