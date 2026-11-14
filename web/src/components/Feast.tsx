"use client";

// The Feast race. Each week the contract adds up what every memecoin was fed
// (`epoch_fed`), and the most fed one pays no tithe the week after. No memecoin
// feasts two weeks running, so the one feasting now is shown in the standings
// but cannot win them. This shows the week's standings, the time left and who
// is feasting now, all read from the contract's own counters.

import { useEffect, useState } from "react";
import { Coin } from "./Coin";
import { DEMO, heresyForToken, type Fed, type Snapshot } from "@/lib/near";
import { feastOf, nextFeast, sittingOut } from "@/lib/feast";
import { usd } from "@/lib/format";

const ZERO = BigInt(0);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The time now, ticking each second. It starts at the chain's own clock, so the server and the browser draw the same first frame. */
function useClock(startMs: number, live: boolean): number {
  const [now, setNow] = useState(startMs);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  return now;
}

type Row = { token: string; symbol: string; micro: bigint };

/** Most fed first. Equal amounts keep the contract's order, which is how it breaks a tie. */
function standings(fed: Fed): Row[] {
  return fed
    .map(([token, micro]) => ({ token, symbol: heresyForToken(token)?.symbol ?? token, micro: BigInt(micro) }))
    .sort((a, b) => (a.micro < b.micro ? 1 : a.micro > b.micro ? -1 : 0));
}

function whenUtc(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

export function Feast({ snap }: { snap: Snapshot }) {
  const { stats, config, fed } = snap;
  const chainMs = Number(BigInt(stats.now_ns) / BigInt(1_000_000));
  // the sample's amounts are fixed, so its clock stands still
  const now = useClock(chainMs, !DEMO);
  const endMs = Number(((BigInt(stats.epoch) + BigInt(1)) * BigInt(config.epoch_ns)) / BigInt(1_000_000));
  const left = Math.max(0, Math.floor((endMs - now) / 1000));
  const parts: [number, string][] = [
    [Math.floor(left / 86_400), "days"],
    [Math.floor((left % 86_400) / 3600), "hours"],
    [Math.floor((left % 3600) / 60), "minutes"],
    [left % 60, "seconds"],
  ];

  const name = (token: string | null) => (token ? heresyForToken(token)?.symbol ?? token : null);
  const feasting = name(feastOf(stats));
  // the memecoin feasting now cannot win this week's race
  const out = sittingOut(stats);
  // last week's most fed memecoin: not the one feasting if it had feasted the week before
  const topLast = name(stats.heaviest_last_epoch);
  const tithe = stats.tithe_bps / 100;
  const board = fed ? standings(fed.now) : [];
  const ranked = board.filter((r) => r.micro > ZERO);
  const unfed = board.filter((r) => r.micro === ZERO);
  const next = fed ? nextFeast(fed.now, stats) : null;
  const lead = ranked.find((r) => r.token === next);
  const places = new Map(ranked.filter((r) => r.token !== out).map((r, i) => [r.token, i + 1]));
  // the longest bar is the most fed memecoin, which may be the one feasting
  const most = ranked[0]?.micro ?? ZERO;
  const wonWith = fed && feasting ? standings(fed.last).find((r) => r.symbol === feasting)?.micro : undefined;

  return (
    <div className="feast-layout">
      <div className="race-side">
        <h3>This week&apos;s race</h3>
        {!fed ? (
          <p className="hint">This week&apos;s standings could not be read from the chain. The page asks again every minute.</p>
        ) : (
          <>
            {ranked.length === 0 ? (
              <p className="race-empty">
                Nothing has been fed this week. The first feeding{out && feasting ? ` of any memecoin but ${feasting}` : ""} takes the lead.
              </p>
            ) : (
              <ol className="race">
                {ranked.map((r) => {
                  const sits = r.token === out;
                  return (
                    <li key={r.symbol} className={sits ? "sits" : r === lead ? "lead" : undefined}>
                      <span className="race-place">{places.get(r.token) ?? ""}</span>
                      <Coin symbol={r.symbol} size={38} />
                      <span className="race-name">
                        <span className="sym">{r.symbol}</span>
                        <em>
                          {sits
                            ? "feasting now, so it cannot win this week"
                            : !lead || r === lead
                              ? "in the lead"
                              : `${usd(lead.micro - r.micro)} behind`}
                        </em>
                      </span>
                      <span className="race-fed">{usd(r.micro, 0)}</span>
                      <span className="race-bar" aria-hidden>
                        <span style={{ width: `${Math.max(1.5, Number((r.micro * BigInt(10_000)) / most) / 100)}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {unfed.length > 0 && (
              <div className="race-unfed">
                <span>Not fed this week</span>
                <ul>
                  {unfed.map((r) => (
                    <li key={r.symbol}>
                      <Coin symbol={r.symbol} size={22} />
                      {r.symbol}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <aside className="feast-plate">
        <div className="feast-now">
          <h3>Feasting now</h3>
          {feasting ? (
            <>
              <p className="feast-who">
                <Coin symbol={feasting} size={58} />
                <strong>{feasting}</strong>
              </p>
              <p>
                {topLast && topLast !== feasting
                  ? `${topLast} was fed the most last week, but it had just feasted, so the Feast passed to ${feasting}, the next most fed${wonWith ? ` with ${usd(wonWith, 0)}` : ""}. `
                  : wonWith
                    ? `It won last week with ${usd(wonWith, 0)} fed. `
                    : "It won last week. "}
                Until this week ends, feeding {feasting} pays no tithe. Every other memecoin pays {tithe}%.
              </p>
            </>
          ) : topLast ? (
            <p>
              No memecoin. Only {topLast} was fed last week, and it had just feasted, so every feeding pays the {tithe}% tithe.
            </p>
          ) : (
            <p>No memecoin. Nothing was fed last week, so every feeding pays the {tithe}% tithe.</p>
          )}
        </div>

        <div className="feast-ends">
          <h3>The week ends in</h3>
          <div className="feast-clock" role="timer" aria-label={`${parts[0][0]} days, ${parts[1][0]} hours and ${parts[2][0]} minutes`}>
            {parts.map(([n, unit]) => (
              <span key={unit}>
                <b>{String(n).padStart(2, "0")}</b>
                <i>{unit}</i>
              </span>
            ))}
          </div>
          <p className="hint">
            {left > 0 ? `${whenUtc(endMs)}. ` : "The week is over and a new one is being counted. "}
            {lead
              ? `If it ended now, ${lead.symbol} would feast next week.`
              : fed
                ? "If it ended now, no memecoin would feast next week."
                : ""}
          </p>
        </div>
      </aside>
    </div>
  );
}
