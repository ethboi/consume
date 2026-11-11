"use client";

// The Ledger: every feeding, every $CONSUME minted and every $CONSUME burned,
// newest first, each with its transaction. The entries come from /api/ledger
// (see lib/ledger.ts), and their sums are checked against the totals the
// contract keeps, so the page can say whether anything is missing.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Coin, ConsumeCoin } from "./Coin";
import { DEMO_LEDGER } from "@/lib/demo";
import { compact, fromRaw, pow10, shortAccount, usd } from "@/lib/format";
import type { Ledger as LedgerData, LedgerEntry } from "@/lib/ledger";
import { useLive } from "@/lib/live";
import { CONSUME_CONTRACT, DEMO, EXPLORER, heresyForToken, type Snapshot } from "@/lib/near";

const CONSUME_DEC = 18;
const FIRST = 6;
const MORE = 20;

type Show = "all" | "fed" | "minted" | "burned";
const SHOWS: { key: Show; label: string; has: (e: LedgerEntry) => boolean }[] = [
  { key: "all", label: "All", has: () => true },
  { key: "fed", label: "Feedings", has: (e) => e.kind === "feed" },
  { key: "minted", label: "Mints", has: (e) => e.kind === "collect" || e.kind === "break" },
  { key: "burned", label: "Burns", has: (e) => e.kind === "redeem" },
];
const NONE: Record<Show, string> = {
  all: "Nothing has been fed yet. The first feeding will be written here.",
  fed: "Nothing has been fed yet. The first feeding will be written here.",
  minted: "No $CONSUME has been minted yet. It is minted when a Bond is collected from, or its seal is broken.",
  burned: "No $CONSUME has been burned yet. Redeeming burns it, and every redemption will be written here.",
};

const big = (v: string | undefined): bigint => (v && /^\d+$/.test(v) ? BigInt(v) : BigInt(0));
/** $CONSUME for reading: whole numbers once there are thousands, two places below that. */
const consume = (raw: bigint | string | undefined): string => {
  const v = typeof raw === "bigint" ? raw : big(raw);
  return fromRaw(v, CONSUME_DEC, v >= BigInt(1000) * pow10(CONSUME_DEC) ? 0 : 2);
};
const when = (ms: number) =>
  `${new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
const shortHash = (h: string) => `${h.slice(0, 5)}…${h.slice(-4)}`;

async function fetchLedger(): Promise<LedgerData> {
  const res = await fetch("/api/ledger", { cache: "no-store" });
  const body = (await res.json()) as LedgerData & { error?: string };
  if (!res.ok || !Array.isArray(body.entries)) throw new Error(body.error ?? `The Ledger answered ${res.status}`);
  return body;
}

/**
 * `stats` are the contract's own totals, or null while the page is showing
 * sample figures. `fallback` is shown when the history cannot be read.
 */
export function Ledger({ stats, tick, fallback }: { stats: Snapshot["stats"] | null; tick: number; fallback: ReactNode }) {
  const live = useLive(DEMO ? null : `ledger:${tick}`, fetchLedger, 30_000);
  // a new reading replaces the last one only once it has arrived, so the list never blinks
  const [last, setLast] = useState<LedgerData | null>(DEMO ? DEMO_LEDGER : null);
  if (live.data && live.data !== last) setLast(live.data);
  const [show, setShow] = useState<Show>("all");
  const [rows, setRows] = useState(FIRST);
  // leave out the builder's own accounts, to see what everyone else did
  const [outside, setOutside] = useState(false);

  if (!last) {
    if (live.error) {
      return (
        <>
          <p className="roll-note" role="status">
            The history of mints and burns could not be read just now. These are the latest feedings as the contract holds them; every
            transaction is on the{" "}
            <a href={`${EXPLORER}/address/${CONSUME_CONTRACT}`} target="_blank" rel="noreferrer">
              explorer
            </a>
            .
          </p>
          {fallback}
        </>
      );
    }
    return <p className="empty">Reading the Ledger…</p>;
  }

  const entries = last.entries;
  // an answer from before the site told the builder's accounts apart has neither field
  const split = last.builder && last.feedings ? { account: last.builder, own: last.feedings.builder, others: last.feedings.others } : null;
  const fedTimes = split ? split.own + split.others : 0;
  const shown = split && outside ? entries.filter((e) => !e.by_builder) : entries;
  const listed = shown.filter(SHOWS.find((s) => s.key === show)!.has);
  const sum = (k: "minted" | "burned" | "forfeited") => entries.reduce((a, e) => a + big(e[k]), BigInt(0));
  const inList = { minted: sum("minted"), burned: sum("burned"), forfeited: sum("forfeited") };

  // what the contract itself counts: $CONSUME in wallets is all that was minted less all that was burned
  const counted = stats && {
    minted: big(stats.consume_supply) + big(stats.total_redeemed),
    burned: big(stats.total_redeemed),
    forfeited: big(stats.total_forfeited),
  };
  const agrees =
    counted && counted.minted === inList.minted && counted.burned === inList.burned && counted.forfeited === inList.forfeited;
  const short = counted && (counted.minted > inList.minted || counted.burned > inList.burned || counted.forfeited > inList.forfeited);
  // the totals shown are the contract's own whenever they are known, so they are right even when the list is short
  const totals = counted ?? inList;
  const explorer = (
    <a href={`${EXPLORER}/address/${CONSUME_CONTRACT}`} target="_blank" rel="noreferrer">
      explorer
    </a>
  );

  return (
    <div className="roll-wrap">
      <dl className="roll-sums">
        <div>
          <dt>Minted</dt>
          <dd>{consume(totals.minted)}</dd>
        </div>
        <div>
          <dt>Burned</dt>
          <dd>{consume(totals.burned)}</dd>
        </div>
        <div>
          <dt>Forfeited, never minted</dt>
          <dd>{consume(totals.forfeited)}</dd>
        </div>
      </dl>
      <p className="roll-note" role="status">
        {DEMO ? (
          "Sample entries. On a live contract each one links to its transaction."
        ) : agrees ? (
          <>
            <b>Checked against the contract.</b> The entries add up to its totals. That does not prove the history is complete.
          </>
        ) : short ? (
          <>
            These are the totals the contract keeps. The entries below add up to {consume(inList.minted)} minted, {consume(inList.burned)}{" "}
            burned and {consume(inList.forfeited)} forfeited:{" "}
            {last.discovery_limits_reached ? "the search reached its limits." : "some accounts or new entries may be missing."} Every transaction is on the{" "}
            {explorer}.
          </>
        ) : (
          <>
            Read from indexed event logs. {last.discovery_limits_reached ? "The search reached its limits." : "Some accounts or new entries may be missing."}{" "}
            Every transaction is on the {explorer}.
          </>
        )}
      </p>

      {split && fedTimes > 0 && (
        <div className="roll-who">
          <p>
            {split.others === 0 ? (
              <>
                {fedTimes === 1 ? "The one feeding so far is" : `All ${fedTimes} feedings so far are`} from the builder&apos;s own accounts,{" "}
                <b>{split.account}</b> and those under it. <Link href="/demo">Be the first from outside.</Link>
              </>
            ) : (
              <>
                <b>
                  {split.others} of {fedTimes} feedings
                </b>{" "}
                came from {last.feeders.others === 1 ? "one account" : `${last.feeders.others} accounts`} outside the builder&apos;s own. The
                builder&apos;s own are <b>{split.account}</b> and the accounts under it, marked below.
              </>
            )}
          </p>
          <label>
            <input
              type="checkbox"
              checked={outside}
              onChange={(ev) => {
                setOutside(ev.target.checked);
                setRows(FIRST);
              }}
            />
            Leave out the builder&apos;s accounts
          </label>
        </div>
      )}

      <div className="roll-shows" role="group" aria-label="Show">
        {SHOWS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={show === s.key}
            onClick={() => {
              setShow(s.key);
              setRows(FIRST);
            }}
          >
            {s.label} <span>{shown.filter(s.has).length}</span>
          </button>
        ))}
      </div>

      {listed.length === 0 ? (
        <p className="empty">
          {outside && entries.some(SHOWS.find((s) => s.key === show)!.has)
            ? "Nothing here from outside the builder's accounts yet. The first will be written here."
            : NONE[show]}
        </p>
      ) : (
        <ol className="roll">
          {listed.slice(0, rows).map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </ol>
      )}
      {listed.length > rows && (
        <button type="button" className="small-button roll-more" onClick={() => setRows((n) => n + MORE)}>
          Show {Math.min(MORE, listed.length - rows)} more
        </button>
      )}
    </div>
  );
}

function Row({ e }: { e: LedgerEntry }) {
  const h = e.token ? heresyForToken(e.token) : undefined;
  const who = <b title={e.account}>{shortAccount(e.account, 32)}</b>;
  const own = e.by_builder && (
    <em className="roll-tag roll-own" title="One of the builder's own accounts">
      builder
    </em>
  );
  return (
    <li className={`roll-${e.kind}`}>
      <time dateTime={new Date(e.at).toISOString()}>{when(e.at)}</time>
      <span className="roll-coin">{e.kind === "feed" && h ? <Coin symbol={h.symbol} size={30} /> : <ConsumeCoin size={30} />}</span>
      <p className="roll-what">
        {e.kind === "feed" && (
          <>
            {who} fed {h ? `${compact(e.amount ?? "0", h.decimals)} ${h.symbol}` : "a memecoin"}, worth {usd(big(e.usd))}
            {e.feast && <em className="roll-tag">feast</em>}
            {own}
          </>
        )}
        {e.kind === "collect" && (
          <>
            {who} collected from Bond {e.bond}
            {own}
          </>
        )}
        {e.kind === "break" && (
          <>
            {who} broke the seal on Bond {e.bond}
            {own}
          </>
        )}
        {e.kind === "redeem" && (
          <>
            {who} redeemed for a share of the Stomach
            {own}
            {e.shares && e.shares.length > 0 && (
              <small>
                {e.shares
                  .map(([token, amount]) => {
                    const m = heresyForToken(token);
                    return m ? `${compact(amount, m.decimals)} ${m.symbol}` : null;
                  })
                  .filter(Boolean)
                  .join(", ")}
              </small>
            )}
          </>
        )}
      </p>
      <p className="roll-figure">
        {e.kind === "feed" && (
          <>
            <span>{consume(e.locked)} locked</span>
            <small>in Bond {e.bond}, not minted yet</small>
          </>
        )}
        {e.kind === "collect" && <strong>{consume(e.minted)} minted</strong>}
        {e.kind === "break" && (
          <>
            <strong>{consume(e.minted)} minted</strong>
            <small>{consume(e.forfeited)} forfeited</small>
          </>
        )}
        {e.kind === "redeem" && <strong>{consume(e.burned)} burned</strong>}
      </p>
      {e.tx ? (
        <a className="roll-tx" href={`${EXPLORER}/txns/${e.tx}`} target="_blank" rel="noreferrer" aria-label={`Transaction ${e.tx}`}>
          {shortHash(e.tx)}
        </a>
      ) : (
        <span className="roll-tx" aria-hidden="true" />
      )}
    </li>
  );
}
