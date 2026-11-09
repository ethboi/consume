"use client";

import { useCallback, useMemo, useState } from "react";
import { HERESIES as THE_TEN } from "@/lib/heresies";
import {
  CONSUME_CONTRACT,
  DEMO,
  EXPLORER,
  NETWORK,
  cleanError,
  heresyForToken,
  loadSnapshot,
  tokenAccount,
  view,
  type MealQuote,
  type RedeemQuote,
  type Snapshot,
  type VestView,
} from "@/lib/near";
import { compact, daysLeft, fromRaw, shortAccount, toRaw, usd, usdValue, vestedFraction } from "@/lib/format";
import { Ouroboros } from "./Ouroboros";
import { Stomach } from "./Stomach";
import { Coin } from "./Coin";
import { Banderole, Glory, Woodblock } from "./Woodblock";
import { BookEmblem, CoinsEmblem, StomachEmblem, HourglassEmblem, QuillEmblem, ScalesEmblem } from "./Emblems";
import { TGAS, hasEvent, useWallet, type TxResult } from "./Wallet";
import { sleep, useLive } from "@/lib/live";

const ONE_YOCTO = "1";
const CONSUME_DEC = 18;
const REPO_URL = (process.env.NEXT_PUBLIC_REPO_URL ?? "").trim();
// where the ten coins hang around the serpent (degrees, 0 = right, clockwise),
// clear of the head at the top and the banner below
const ORBIT = [150, 172, 194, 216, 238, 302, 324, 346, 8, 30];

type Toast = { text: string; href?: string } | null;
type Done = (text: string, hash?: string) => void;

export function Consume({ initial, loadError }: { initial: Snapshot; loadError: string | null }) {
  const [snap, setSnap] = useState(initial);
  const [toast, setToast] = useState<Toast>(null);
  const [tick, setTick] = useState(0); // bumps after any transaction so panels reload

  const refresh = useCallback(async () => {
    if (DEMO) return;
    try {
      setSnap(await loadSnapshot());
    } catch {
      // keep the last good snapshot
    }
    setTick((t) => t + 1);
  }, []);

  const done: Done = useCallback(
    (text, hash) => {
      setToast({ text, href: hash ? `${EXPLORER}/txns/${hash}` : undefined });
      setTimeout(() => setToast(null), 9000);
      refresh();
    },
    [refresh],
  );

  const tribeByToken = useMemo(() => new Map(snap.tribes), [snap.tribes]);
  const held = THE_TEN.map((h) => {
    const t = tribeByToken.get(tokenAccount(h));
    const micro = t ? usdValue(t.stomach, t.decimals, t.price_e18) : BigInt(0);
    return { h, t, micro };
  });
  const totalMicro = held.reduce((a, x) => a + x.micro, BigInt(0));
  const denom = BigInt(snap.stats.consume_supply) + BigInt(snap.stats.total_unvested);
  // micro-USD per whole CONSUME
  const floor = denom > BigInt(0) ? Number(totalMicro) / (Number(denom) / 1e18) : 0;
  const floorLabel = usd(BigInt(Math.round(floor)), 6);
  const feast = snap.stats.heaviest_last_epoch ? heresyForToken(snap.stats.heaviest_last_epoch)?.symbol : null;
  const bonusX = snap.config.heaviest_bonus_bps / 10000;

  return (
    <div className="folio">
      <Masthead />
      {DEMO && <p className="demo-note">Sample figures. The contract is not deployed yet, so nothing here can be signed.</p>}
      {loadError && <p className="demo-note">Could not read the contract just now ({loadError}). Showing sample figures.</p>}

      <section className="hero" aria-labelledby="mark">
        <Woodblock>
          <div className="hero-sigil">
            <Glory />
            <Ouroboros animate />
            {THE_TEN.map((h, i) => (
              <span
                key={h.symbol}
                className="float-coin"
                style={{ ["--a" as string]: `${ORBIT[i]}deg`, ["--tilt" as string]: `${(i % 2 ? 1 : -1) * (6 + (i % 4) * 4)}deg`, ["--delay" as string]: `${-i * 0.7}s`, ["--i" as string]: i }}
                aria-hidden="true"
              >
                <Coin symbol={h.symbol} chain={h.chain} size={64} />
              </span>
            ))}
            <h1 id="mark">Consume</h1>
          </div>
          <Banderole>A memecoin that eats other memecoins.</Banderole>
          <div className="floor" aria-hidden="true" />
        </Woodblock>
        <p className="hero-sub">
          Feed it your DOGE, PEPE or SHIB and it pays you in $CONSUME. What it eats stays in its stomach for good, and every
          $CONSUME can be redeemed for its share of everything in its stomach.
        </p>
        <p className="hero-sub">
          So far it has consumed <strong>{usd(snap.stats.total_eaten_usd, 0)}</strong>. Each $CONSUME is backed by{" "}
          <strong>{floorLabel}</strong>.
        </p>
        <div className="hero-actions">
          <a className="press" href="#feed">
            Feed the Stomach
          </a>
          <a className="press quiet" href="#rule">
            Read the rule
          </a>
        </div>
      </section>

      <section className="chapter" id="crucible" aria-labelledby="crucible-h">
        <header>
          <StomachEmblem />
          <h2 id="crucible-h">The Stomach</h2>
          <p>Every meme it has eaten, held by the contract. No function lets anyone withdraw it except by redeeming $CONSUME.</p>
        </header>
        <ul className="the-ten" aria-label="The ten memes it eats">
          {THE_TEN.map((h) => (
            <li key={h.symbol}>
              <Coin symbol={h.symbol} chain={h.chain} size={84} />
              <span>{h.symbol}</span>
            </li>
          ))}
        </ul>
        <div className="crucible-layout">
          <div>
            <Stomach jars={held.map(({ h, t, micro }) => ({ symbol: h.symbol, usd: Number(micro) / 1e6, open: t?.open ?? false }))} />
            <div className="held">
              <span>Held in all ten jars</span>
              <strong>{usd(totalMicro, 0)}</strong>
            </div>
            <div className="held">
              <span>Backing for each $CONSUME</span>
              <strong className="rubric">{floorLabel}</strong>
            </div>
          </div>
          <div>
            <table className="ledger">
              <caption>The ten memes it will eat, and what it holds of each.</caption>
              <thead>
                <tr>
                  <th scope="col">Meme</th>
                  <th scope="col">Held</th>
                  <th scope="col">Worth</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                {held.map(({ h, t, micro }) => (
                  <tr key={h.symbol}>
                    <td className="with-coin">
                      <Coin symbol={h.symbol} size={30} />
                      <span className="sym">{h.symbol}</span>
                      <span className="chain">
                        from {h.chain}
                        {t && !t.open ? ", sealed for now" : ""}
                      </span>
                    </td>
                    <td>{t ? compact(t.stomach, t.decimals) : "0"}</td>
                    <td>{usd(micro, 0)}</td>
                    <td className={t?.open ? "" : "closed"}>{t ? priceLabel(t.price_e18) : "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="decree">
              <p>
                It pays <strong>{fromRaw(snap.stats.current_rate, CONSUME_DEC, 2)} $CONSUME</strong> for every dollar fed. At {usd(snap.stats.next_halving_at_usd, 0)}{" "}
                consumed, famine halves that.
              </p>
              {feast ? (
                <p>
                  This week&apos;s feast is <strong>{feast}</strong>: feeding it pays {bonusX}×, because it was eaten most last week.
                </p>
              ) : (
                <p>No feast this week. Whichever meme is fed most this week becomes next week&apos;s feast.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="chapter band band-red" id="feed" aria-labelledby="feed-h">
        <header>
          <CoinsEmblem />
          <h2 id="feed-h">Feed the Stomach</h2>
          <p>Give it one of the ten. Receive an Indulgence that releases $CONSUME to you over 30 days.</p>
        </header>
        <Feed snap={snap} tick={tick} onDone={done} />
      </section>

      <section className="chapter band band-ink" id="writs" aria-labelledby="writs-h">
        <header>
          <HourglassEmblem />
          <h2 id="writs-h">Your Indulgences</h2>
          <p>Each Indulgence is an NFT. Whoever holds it collects what has been released, so it can be sold or given away.</p>
        </header>
        <Indulgences snap={snap} tick={tick} onDone={done} />
      </section>

      <section className="chapter after-band" id="transmute" aria-labelledby="transmute-h">
        <header>
          <ScalesEmblem />
          <h2 id="transmute-h">Redeem</h2>
          <p>Burn $CONSUME. Take your share of every meme in the Stomach.</p>
        </header>
        <Redeem snap={snap} tick={tick} onDone={done} />
      </section>

      <section className="chapter" id="ledger" aria-labelledby="ledger-h">
        <header>
          <QuillEmblem />
          <h2 id="ledger-h">The Ledger</h2>
          <p>The latest feedings, newest first.</p>
        </header>
        <Entries recent={snap.recent} />
      </section>

      <section className="chapter band band-ink invert" id="rule" aria-labelledby="rule-h">
        <header>
          <BookEmblem />
          <h2 id="rule-h">The Rule</h2>
          <p>Everything below is enforced by the contract{CONSUME_CONTRACT ? ` ${CONSUME_CONTRACT}` : ""}.</p>
        </header>
        <Rule snap={snap} />
      </section>

      <footer className="colophon invert">
        <span>
          Built at NEAR HACKATHON. {NETWORK === "testnet" ? "Running on NEAR testnet with stand-in memes from a faucet." : "Running on NEAR mainnet."}
        </span>
        <span>
          {REPO_URL && (
            <>
              Source on <a href={REPO_URL}>GitHub</a>.{" "}
            </>
          )}
          Also by this builder: <a href="https://oneup.markets">OneUp</a>.
        </span>
      </footer>

      {toast && (
        <div className="toast" role="status">
          {toast.text}{" "}
          {toast.href && (
            <a href={toast.href} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function priceLabel(priceE18: string): string {
  const p = Number(BigInt(priceE18)) / 1e18;
  if (p === 0) return "none";
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  // never scientific notation: enough decimals for three significant digits
  const decimals = Math.min(18, Math.ceil(-Math.log10(p)) + 2);
  return `$${p.toFixed(decimals)}`;
}

// ---------------------------------------------------------------- masthead

function Masthead() {
  const { accountId, ready, connect, disconnect } = useWallet();
  return (
    <header className="masthead">
      <a className="masthead-mark" href="#mark" aria-label="CONSUME, back to top">
        <Ouroboros size={40} detailed={false} title="" />
        <span>Consume</span>
      </a>
      <nav aria-label="Sections">
        <a href="#crucible">The Stomach</a>
        <a href="#feed">Feed</a>
        <a href="#writs">Indulgences</a>
        <a href="#transmute">Redeem</a>
        <a href="#ledger">Ledger</a>
      </nav>
      {accountId ? (
        <button className="sign-button" onClick={disconnect} title="Sign out">
          {shortAccount(accountId)}
        </button>
      ) : (
        <button className="sign-button" onClick={connect} disabled={!ready || DEMO}>
          Connect wallet
        </button>
      )}
    </header>
  );
}

// ---------------------------------------------------------------- feed

const CREDIT_TOP_UP = "100000000000000000000000"; // 0.1 NEAR
const CREDIT_LOW = BigInt("30000000000000000000000"); // below 0.03 NEAR, top up

function demoQuote(snap: Snapshot, token: string, raw: bigint, decimals: number): MealQuote | null {
  const tribe = snap.tribes.find(([k]) => k === token)?.[1];
  if (!tribe) return null;
  const meal = usdValue(raw, decimals, tribe.price_e18);
  const cap = BigInt(tribe.max_meal_usd);
  const m = meal > cap ? cap : meal;
  return {
    accepted: raw.toString(),
    refund: "0",
    meal_usd: m.toString(),
    consume: ((m * BigInt(snap.stats.current_rate)) / BigInt(1_000_000)).toString(),
    bonus: snap.stats.heaviest_last_epoch === token,
  };
}

/** Registration calls needed before `accountId` can receive these tokens. */
async function registrationCalls(tokens: string[], accountId: string) {
  const calls = [];
  for (const token of tokens) {
    const reg = await view<unknown>(token, "storage_balance_of", { account_id: accountId }).catch(() => null);
    if (reg) continue;
    if (NETWORK === "testnet") {
      calls.push({ receiverId: token, methodName: "register", args: { account_id: accountId }, gas: TGAS(10) });
    } else {
      const bounds = await view<{ min: string }>(token, "storage_balance_bounds");
      calls.push({
        receiverId: token,
        methodName: "storage_deposit",
        args: { account_id: accountId, registration_only: true },
        deposit: bounds.min,
        gas: TGAS(10),
      });
    }
  }
  return calls;
}

function Feed({ snap, tick, onDone }: { snap: Snapshot; tick: number; onDone: Done }) {
  const { accountId, send, connect } = useWallet();
  const [symbol, setSymbol] = useState("PEPE");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const h = THE_TEN.find((x) => x.symbol === symbol)!;
  const token = tokenAccount(h);
  const tribe = snap.tribes.find(([k]) => k === token)?.[1];
  const raw = toRaw(amount, h.decimals);

  const bal = useLive(DEMO || !accountId ? null : `${accountId}:${token}:${tick}`, async () =>
    BigInt(await view<string>(token, "ft_balance_of", { account_id: accountId })),
  );
  const credit = useLive(DEMO || !accountId ? null : `${accountId}:credit:${tick}`, async () =>
    BigInt((await view<string>(CONSUME_CONTRACT, "get_meal_credit", { account_id: accountId })) ?? "0"),
  );
  const q = useLive(raw && raw > BigInt(0) ? `${token}:${raw}:${tick}` : null, async () => {
    if (DEMO) return demoQuote(snap, token, raw!, h.decimals);
    await sleep(300); // debounce typing; superseded keys are ignored by useLive
    return view<MealQuote>(CONSUME_CONTRACT, "quote_meal", { token_id: token, amount: raw!.toString() });
  });
  const quote = q.data ?? null;
  const balance = bal.data ?? null;

  const faucet = async () => {
    setBusy(true);
    setError(null);
    try {
      const [r] = await send([{ receiverId: token, methodName: "faucet", args: {}, gas: TGAS(30) }]);
      if (r.failure) throw new Error(r.failure);
      onDone(`The faucet gave you ${Number(h.faucetWhole).toLocaleString("en-US")} test ${h.symbol}.`, r.hash);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  const feed = async () => {
    if (!raw || !quote || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const calls = [];
      if ((credit.data ?? BigInt(0)) < CREDIT_LOW) {
        calls.push({ receiverId: CONSUME_CONTRACT, methodName: "add_meal_credit", args: {}, deposit: CREDIT_TOP_UP, gas: TGAS(10) });
      }
      // refuse to be paid less than 99% of the quote, or after ten minutes
      const msg = JSON.stringify({
        min_consume: ((BigInt(quote.consume) * BigInt(99)) / BigInt(100)).toString(),
        deadline_ns: (BigInt(Date.now() + 10 * 60_000) * BigInt(1_000_000)).toString(),
      });
      calls.push({
        receiverId: token,
        methodName: "ft_transfer_call",
        args: { receiver_id: CONSUME_CONTRACT, amount: raw.toString(), msg },
        deposit: ONE_YOCTO,
        gas: TGAS(150),
      });
      const results = await send(calls);
      const last = results[results.length - 1];
      if (!hasEvent(results, "meal")) {
        throw new Error(`It refused the feeding and your ${h.symbol} was returned${last.failure ? `: ${last.failure}` : "."}`);
      }
      setAmount("");
      onDone(`Fed ${fromRaw(quote.accepted, h.decimals)} ${h.symbol} to the Stomach. Your Indulgence is minted.`, last.hash);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  const withdrawCredit = async () => {
    setBusy(true);
    try {
      const [r] = await send([{ receiverId: CONSUME_CONTRACT, methodName: "withdraw_meal_credit", args: {}, gas: TGAS(20) }]);
      if (r.failure) throw new Error(r.failure);
      onDone("Your unused storage credit was returned.", r.hash);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  const over = balance !== null && raw !== null && raw > balance;
  const shownError = error ?? q.error ?? null;

  return (
    <div className="leaf offering">
      <fieldset className="picker">
        <legend>Choose the meme</legend>
        {THE_TEN.map((x) => {
          const t = snap.tribes.find(([k]) => k === tokenAccount(x))?.[1];
          return (
            <label key={x.symbol}>
              <input
                type="radio"
                name="meme"
                value={x.symbol}
                checked={symbol === x.symbol}
                disabled={!t?.open}
                onChange={() => {
                  setSymbol(x.symbol);
                  setAmount("");
                  setError(null);
                }}
              />
              <Coin symbol={x.symbol} size={34} />
              <span className={x.symbol.length > 8 ? "s long" : "s"}>{x.symbol}</span>
              <span className="c">{t?.open ? `from ${x.chain}` : "sealed for now"}</span>
            </label>
          );
        })}
      </fieldset>

      <div>
        <h3>Feed it {h.symbol}</h3>
        <div className="field">
          <label htmlFor="amount">Amount of {h.symbol}</label>
          <div className="field-row">
            <input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              aria-describedby="amount-help"
            />
            <button
              className="small-button"
              type="button"
              disabled={!balance}
              onClick={() => balance !== null && setAmount(fromRaw(balance, h.decimals, h.decimals).replace(/,/g, ""))}
            >
              All of it
            </button>
          </div>
          <span id="amount-help" className="hint">
            {balance !== null ? `You hold ${fromRaw(balance, h.decimals)} ${h.symbol}.` : "Connect a wallet to see what you hold."}
            {tribe ? ` Largest feeding: ${usd(tribe.max_meal_usd, 0)}. Anything over it comes back to you.` : ""}
          </span>
        </div>

        <div className="verdict" aria-live="polite">
          {shownError ? (
            <p className="error">{shownError}</p>
          ) : quote ? (
            <p>
              It will eat {fromRaw(quote.accepted, h.decimals)} {h.symbol}, worth {usd(quote.meal_usd)}, and grant an Indulgence for{" "}
              {fromRaw(quote.consume, CONSUME_DEC, 0)} $CONSUME
              {quote.bonus ? `, including the feast bonus` : ""}.
              {BigInt(quote.refund) > BigInt(0) ? ` ${fromRaw(quote.refund, h.decimals)} ${h.symbol} comes back to you.` : ""}
            </p>
          ) : over ? (
            <p className="error">That is more {h.symbol} than you hold.</p>
          ) : q.loading ? (
            <p className="hint">Asking what it pays…</p>
          ) : (
            <p className="hint">Enter an amount to see what it pays.</p>
          )}
        </div>

        <div className="actions">
          {accountId ? (
            <button className="press" disabled={DEMO || busy || !quote || over} onClick={feed}>
              {busy ? "Waiting for the wallet" : "Feed the Stomach"}
            </button>
          ) : (
            <button className="press" disabled={DEMO} onClick={connect}>
              Connect wallet to feed
            </button>
          )}
          {NETWORK === "testnet" && (
            <button className="small-button" disabled={DEMO || busy || !accountId} onClick={faucet}>
              Get test {h.symbol}
            </button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Once fed, the {h.symbol} stays in the Stomach for good. It comes back out only as shares, when someone redeems $CONSUME. Each
          Indulgence takes a little NEAR for storage, paid from a refundable credit
          {credit.data !== undefined ? ` (yours: ${fromRaw(credit.data, 24, 3)} NEAR` : ""}
          {credit.data !== undefined && credit.data > BigInt(0) ? (
            <>
              ,{" "}
              <button className="link-button" disabled={busy} onClick={withdrawCredit}>
                take it back
              </button>
              )
            </>
          ) : credit.data !== undefined ? ")" : ""}
          . The first feeding adds 0.1 NEAR to it.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- indulgences

async function loadAllVests(accountId: string): Promise<VestView[]> {
  const out: VestView[] = [];
  for (let from = 0; ; from += 50) {
    const page = await view<VestView[]>(CONSUME_CONTRACT, "get_vests_for_owner", { account_id: accountId, from_index: from, limit: 50 });
    out.push(...page);
    if (page.length < 50) break;
  }
  return out.sort((a, b) => Number(b.token_id) - Number(a.token_id));
}

function Indulgences({ snap, tick, onDone }: { snap: Snapshot; tick: number; onDone: Done }) {
  const { accountId, send } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBreak, setConfirmBreak] = useState<string | null>(null);

  // refreshed every 30 s and on focus, so "Collect" stays current as it vests
  const live = useLive(DEMO || !accountId ? null : `${accountId}:${tick}`, () => loadAllVests(accountId!), 30_000);
  const vests = DEMO ? snap.recent.slice(0, 3) : live.data;

  const act = async (id: string, method: "claim" | "exit", text: string) => {
    setBusyId(id);
    setError(null);
    try {
      const [r] = await send([
        { receiverId: CONSUME_CONTRACT, methodName: method, args: { token_id: id }, deposit: method === "exit" ? ONE_YOCTO : "0", gas: TGAS(50) },
      ]);
      if (r.failure) throw new Error(r.failure);
      setConfirmBreak(null);
      onDone(text, r.hash);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusyId(null);
    }
  };

  if (!DEMO && !accountId) return <p className="empty">Connect a wallet to see the Indulgences you hold.</p>;
  if (!DEMO && live.error)
    return (
      <p className="empty">
        Could not read your Indulgences ({cleanError(live.error)}).{" "}
        <button className="link-button" onClick={live.reload}>
          Try again
        </button>
      </p>
    );
  if (!vests) return <p className="empty">Reading your Indulgences…</p>;
  if (vests.length === 0) return <p className="empty">You hold no Indulgences yet. Feed the Stomach to receive one.</p>;

  return (
    <>
      {error && <p className="demo-note">{error}</p>}
      <div className="writs">
        {vests.map((v) => {
          const h = heresyForToken(v.vest.tribe);
          const frac = vestedFraction(v.vest.start_ns, v.vest.duration_ns);
          const left = daysLeft(v.vest.start_ns, v.vest.duration_ns);
          const claimable = BigInt(v.claimable);
          const locked = BigInt(v.locked);
          const forfeit = locked - (BigInt(v.exit_payout) - claimable);
          return (
            <article key={v.token_id} className={v.vest.exited ? "writ broken" : "writ"}>
              {/* the NFT's own image, exactly as wallets and marketplaces show it */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="writ-card"
                src={`/indulgence/${v.token_id}.svg?v=${tick}`}
                width={600}
                height={900}
                alt={`Indulgence ${v.token_id}: ${h ? fromRaw(v.vest.eaten, h.decimals) : v.vest.eaten} ${h?.symbol ?? ""} fed, worth ${usd(
                  v.vest.meal_usd,
                )}, releasing ${fromRaw(v.vest.total, CONSUME_DEC, 0)} $CONSUME${v.vest.exited ? ", seal broken" : ""}`}
              />
              {v.vest.exited ? (
                <p>Seal broken. Its holder took the early payout and forfeited the rest.</p>
              ) : (
                <>
                  <div className="sand" suppressHydrationWarning role="progressbar" aria-valuenow={Math.round(frac * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Released so far">
                    <span style={{ width: `${frac * 100}%` }} suppressHydrationWarning />
                  </div>
                  <div className="sand-label">
                    <span suppressHydrationWarning>{Math.round(frac * 100)}% released</span>
                    <span suppressHydrationWarning>{left > 0 ? `${left.toFixed(1)} days left` : "fully released"}</span>
                  </div>
                  <div className="actions">
                    <button
                      className="small-button"
                      disabled={DEMO || claimable === BigInt(0) || busyId === v.token_id}
                      onClick={() => act(v.token_id, "claim", `Collected ${fromRaw(claimable, CONSUME_DEC, 0)} $CONSUME.`)}
                    >
                      Collect {fromRaw(claimable, CONSUME_DEC, 0)} $CONSUME
                    </button>
                    {locked > BigInt(0) &&
                      (confirmBreak === v.token_id ? (
                        <button
                          className="small-button"
                          disabled={busyId === v.token_id}
                          onClick={() => act(v.token_id, "exit", `Seal broken. Received ${fromRaw(v.exit_payout, CONSUME_DEC, 0)} $CONSUME.`)}
                        >
                          Break it: take {fromRaw(v.exit_payout, CONSUME_DEC, 0)}, forfeit {fromRaw(forfeit, CONSUME_DEC, 0)}
                        </button>
                      ) : (
                        <button className="small-button" disabled={DEMO} onClick={() => setConfirmBreak(v.token_id)}>
                          Break the seal early
                        </button>
                      ))}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- redeem

function Redeem({ snap, tick, onDone }: { snap: Snapshot; tick: number; onDone: Done }) {
  const { accountId, send } = useWallet();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const raw = toRaw(amount, CONSUME_DEC);

  const bal = useLive(DEMO || !accountId ? null : `${accountId}:consume:${tick}`, async () =>
    BigInt(await view<string>(CONSUME_CONTRACT, "ft_balance_of", { account_id: accountId })),
  );
  const owedLive = useLive(DEMO || !accountId ? null : `${accountId}:owed:${tick}`, () =>
    view<[string, string][]>(CONSUME_CONTRACT, "get_owed", { account_id: accountId }),
  );
  const q = useLive(raw && raw > BigInt(0) ? `redeem:${raw}:${tick}` : null, async () => {
    if (DEMO) {
      const d = BigInt(snap.stats.consume_supply) + BigInt(snap.stats.total_unvested);
      return { shares: snap.tribes.map(([k, t]) => [k, ((BigInt(t.stomach) * raw!) / d).toString()] as [string, string]), denominator: d.toString() };
    }
    await sleep(300);
    return view<RedeemQuote>(CONSUME_CONTRACT, "quote_redeem", { amount: raw!.toString() });
  });
  const quote = q.data ?? null;
  const balance = bal.data ?? null;
  const owed = owedLive.data ?? [];

  const totalMicro =
    quote?.shares.reduce((a, [k, v]) => {
      const t = snap.tribes.find(([kk]) => kk === k)?.[1];
      return t ? a + usdValue(v, t.decimals, t.price_e18) : a;
    }, BigInt(0)) ?? BigInt(0);

  const afterPayout = async (results: TxResult[], doneText: string) => {
    const left = await view<[string, string][]>(CONSUME_CONTRACT, "get_owed", { account_id: accountId }).catch(() => []);
    const last = results[results.length - 1];
    onDone(
      left.length > 0
        ? `${doneText} ${left.length} ${left.length === 1 ? "share is" : "shares are"} still unpaid; use Retry.`
        : doneText,
      last.hash,
    );
  };

  const redeem = async () => {
    if (!raw || !quote || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const tokens = quote.shares.filter(([, v]) => BigInt(v) > BigInt(0)).map(([k]) => k);
      const results = await send([
        ...(await registrationCalls(tokens, accountId)),
        { receiverId: CONSUME_CONTRACT, methodName: "redeem", args: { amount: raw.toString() }, deposit: ONE_YOCTO, gas: TGAS(300) },
      ]);
      if (!hasEvent(results, "redeem")) throw new Error(results[results.length - 1].failure ?? "The redemption did not go through.");
      setAmount("");
      await afterPayout(results, `Redeemed ${fromRaw(raw, CONSUME_DEC, 0)} $CONSUME for ${usd(totalMicro)} of memes.`);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      const results = await send([
        ...(await registrationCalls(owed.map(([k]) => k), accountId)),
        { receiverId: CONSUME_CONTRACT, methodName: "withdraw_owed", args: {}, gas: TGAS(200) },
      ]);
      const last = results[results.length - 1];
      if (last.failure) throw new Error(last.failure);
      await afterPayout(results, "Paid out what was owed to you.");
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  const over = balance !== null && raw !== null && raw > balance;
  const shownError = error ?? q.error ?? null;

  return (
    <div className="leaf transmute">
      <div className="field">
        <label htmlFor="burn-amount">$CONSUME to burn</label>
        <div className="field-row">
          <input
            id="burn-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
          />
          <button
            className="small-button"
            type="button"
            disabled={!balance}
            onClick={() => balance !== null && setAmount(fromRaw(balance, CONSUME_DEC, 18).replace(/,/g, ""))}
          >
            All of it
          </button>
        </div>
        <span className="hint">
          {accountId && balance !== null ? `You hold ${fromRaw(balance, CONSUME_DEC, 0)} $CONSUME.` : "Collect $CONSUME from your Indulgences first, then burn it here."}
        </span>
      </div>

      <div className="verdict" aria-live="polite">
        {shownError ? (
          <p className="error">{shownError}</p>
        ) : over ? (
          <p className="error">That is more $CONSUME than you hold.</p>
        ) : quote ? (
          <>
            <p>You would receive {usd(totalMicro)} in memes:</p>
            <ul className="shares">
              {quote.shares
                .filter(([, v]) => BigInt(v) > BigInt(0))
                .map(([k, v]) => {
                  const h = heresyForToken(k);
                  return (
                    <li key={k}>
                      <span className="s">{h?.symbol ?? k}</span>
                      <span>{h ? fromRaw(v, h.decimals) : v}</span>
                    </li>
                  );
                })}
            </ul>
          </>
        ) : (
          <p className="hint">Enter an amount to see your share of the Stomach.</p>
        )}
      </div>

      <div className="actions">
        <button className="press" disabled={DEMO || busy || !quote || over || !accountId} onClick={redeem}>
          {busy ? "Waiting for the wallet" : "Burn and redeem"}
        </button>
        {owed.length > 0 && (
          <button className="small-button" disabled={busy} onClick={retry}>
            Retry {owed.length} unpaid {owed.length === 1 ? "share" : "shares"}
          </button>
        )}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Your share counts $CONSUME still locked in Indulgences, so nobody can empty the Stomach before others are paid. If a token cannot
        pay you yet, your share stays owed and Retry registers you and pays it.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- ledger

function Entries({ recent }: { recent: VestView[] }) {
  if (recent.length === 0) return <p className="empty">Nothing has been fed yet. The first feeding will be written here.</p>;
  return (
    <ol className="entries">
      {recent.map((v) => {
        const h = heresyForToken(v.vest.tribe);
        const when = new Date(Number(BigInt(v.vest.start_ns) / BigInt(1_000_000)));
        return (
          <li key={v.token_id}>
            <span className="no">
              {h && <Coin symbol={h.symbol} size={28} />}
              No. {v.token_id}
            </span>
            <span>
              {shortAccount(v.owner_id)} fed it {h ? compact(v.vest.eaten, h.decimals) : ""} {h?.symbol}, worth {usd(v.vest.meal_usd)}, for{" "}
              {fromRaw(v.vest.total, CONSUME_DEC, 0)} $CONSUME.{v.vest.bonus ? " A feast feeding." : ""}
              {v.vest.exited ? " Seal since broken." : ""}{" "}
              <span className="when">{when.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- the rule

function Rule({ snap }: { snap: Snapshot }) {
  const c = snap.config;
  const days = Number(BigInt(c.vest_duration_ns) / BigInt(86_400_000_000_000));
  const haircut = c.exit_haircut_bps / 100;
  return (
    <div className="rule">
      <div>
        <h3>What it eats</h3>
        <p>
          Ten memecoins, all reachable through NEAR Intents from their home chains: DOGE, SHIB, PEPE, PENGU, SPX, TURBO, BOME, and the NEAR
          natives BLACKDRAGON, SHITZU and NearKat. Anything else is refused.
        </p>
      </div>
      <div>
        <h3>What it pays</h3>
        <p>
          {c.start_rate} $CONSUME per dollar at the start. Every {usd(c.halving_usd, 0)} it consumes, famine halves the rate, so the earliest
          feedings earn the most.
        </p>
      </div>
      <div>
        <h3>Indulgences</h3>
        <p>
          Your $CONSUME arrives in an NFT that releases it evenly over {days} days. Sell or give the Indulgence and the rest goes with it. Break the
          seal early and you take what has been released plus half the rest; the other {haircut}% is never minted, which raises everyone
          else&apos;s share.
        </p>
      </div>
      <div>
        <h3>The Stomach</h3>
        <p>
          Fed memes never leave except through redemption. Burning $CONSUME pays your share of every meme inside, measured against all $CONSUME
          including what is still locked in Indulgences.
        </p>
      </div>
      <div>
        <h3>Feasts and limits</h3>
        <p>
          The meme fed most in a week pays {c.heaviest_bonus_bps / 100}% the next week. Each meme has a largest feeding and a daily limit; thin
          markets get small ones so a bad price cannot be used to empty the Stomach.
        </p>
      </div>
      <div>
        <h3>The Assayer</h3>
        <p>
          Prices come from one price-feeder account, the Assayer, which reads NEAR Intents quotes. Feedings are refused when its price is more
          than 15 minutes old. A wrong price can overpay feedings up to the daily limits, but it can never move what is in the Stomach.
        </p>
      </div>
      <div>
        <h3>Who you trust</h3>
        <p>
          The owner can add memes, change limits, seal a meme and replace the Assayer, but has no way to withdraw from the Stomach. A bad
          owner could still list a fake token or appoint a dishonest Assayer, so the owner role is meant to pass to a DAO, and the contract
          account&apos;s keys to be deleted once it is set up.
        </p>
      </div>
    </div>
  );
}
