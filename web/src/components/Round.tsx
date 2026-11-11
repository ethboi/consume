"use client";

// The Assayer's latest price round, folded under "Who you trust": what it
// posted beside what it says it was quoted, with the transaction. The figures
// come from /api/round (src/lib/round.ts). Nothing is shown on sample figures,
// or when the round cannot be read.

import { useLive } from "@/lib/live";
import { DEMO, EXPLORER, type Tribe } from "@/lib/near";
import { priceText as price, type Round } from "@/lib/round";

async function fetchRound(): Promise<Round | null> {
  const res = await fetch("/api/round", { cache: "no-store" });
  const body = (await res.json()) as { round?: Round | null; error?: string };
  if (!res.ok) throw new Error(body.error ?? `The round answered ${res.status}`);
  return body.round ?? null;
}

const when = (iso: string) =>
  iso ? `${new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC` : "";
const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function RoundFold({ tribes }: { tribes: [string, Tribe][] }) {
  const round = useLive(DEMO ? null : "round", fetchRound, 60_000).data;
  if (!round) return null;
  const symbol = (token: string, named: string | null) => tribes.find(([id]) => id === token)?.[1].symbol ?? named ?? token;
  const n = round.prices.length;
  const off = round.prices.filter((p) => p.posted_is_the_quote === false).length;
  return (
    <details className="round-fold">
      <summary>The Assayer&apos;s latest prices, beside its quotes</summary>
      <p className="round-say">
        {COUNT[n] ?? n} prices posted {when(round.at)} in{" "}
        <a href={`${EXPLORER}/txns/${round.tx}`} target="_blank" rel="noreferrer">
          this transaction
        </a>
        .{" "}
        {!round.with_quotes
          ? "This round was sent before the Assayer began writing its quotes into the transaction, so only the posted prices are shown."
          : off === 0
            ? "Each one is exactly the NEAR Intents quote the Assayer wrote beside it. The quotes are its own account: the contract does not check them."
            : `${COUNT[off] ?? off} of them ${off === 1 ? "is" : "are"} not the quote written beside ${off === 1 ? "it" : "them"}.`}
      </p>
      <div className="round-wrap">
        <table className={round.with_quotes ? "round-table" : "round-table plain"}>
          <thead>
            <tr>
              <th scope="col">Memecoin</th>
              <th scope="col">Posted</th>
              {round.with_quotes && (
                <>
                  <th scope="col">Quoted</th>
                  <th scope="col">List price</th>
                  <th scope="col">Quote against list</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {round.prices.map((p) => (
              <tr key={p.token} className={p.posted_is_the_quote === false ? "off" : undefined}>
                <th scope="row">{symbol(p.token, p.symbol)}</th>
                <td>{price(p.posted_usd)}</td>
                {round.with_quotes && (
                  <>
                    <td data-label="quoted">{p.quoted_usd === null ? "" : price(p.quoted_usd)}</td>
                    <td data-label="list">{p.listed_usd === null ? "" : price(p.listed_usd)}</td>
                    <td>{p.quote_from_list_percent === null ? "" : `${p.quote_from_list_percent > 0 ? "+" : ""}${p.quote_from_list_percent.toFixed(2)}%`}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
