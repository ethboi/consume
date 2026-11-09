"use client";

import { useCallback, useMemo, useState } from "react";
import { HERESIES as THE_TEN } from "@/lib/heresies";
import { DEMO_MINE } from "@/lib/demo";
import {
  CONSUME_CONTRACT,
  DEMO,
  EXPLORER,
  INTENTS_CONTRACT,
  MOCK_INTENTS,
  NETWORK,
  VIA_INTENTS,
  cleanError,
  heresyForToken,
  intentsToken,
  loadSnapshot,
  tokenAccount,
  view,
  type MealQuote,
  type RedeemQuote,
  type Snapshot,
  type VestView,
} from "@/lib/near";
import { compact, daysLeft, fromRaw, shortAccount, toRaw, usd, usdCompact, usdValue, vestedFraction } from "@/lib/format";
import { Ouroboros } from "./Ouroboros";
import { Stomach } from "./Stomach";
import { Coin } from "./Coin";
import { CARD_H, CARD_W } from "./IndulgenceCard";
import { Chains } from "./Chains";
import { IntentsWallet } from "./IntentsWallet";
import { Seal } from "./Seal";
import { Glory, Woodblock } from "./Woodblock";
import { BookEmblem, CoinsEmblem, StomachEmblem, HourglassEmblem, QuillEmblem, ScalesEmblem } from "./Emblems";
import { TGAS, hasEvent, useWallet, type TxResult } from "./Wallet";
import { sleep, useLive } from "@/lib/live";

const ONE_YOCTO = "1";
const CONSUME_DEC = 18;
const REPO_URL = (process.env.NEXT_PUBLIC_REPO_URL ?? "").trim();
// where the ten coins hang around the serpent (degrees, 0 = right, clockwise),
// clear of the head at the top and the banner below
// ten coins evenly spaced (36° apart), one above the serpent's head and one
// below; none sits on the horizontal where the wordmark breaks past the ring
const ORBIT = Array.from({ length: 10 }, (_, i) => (270 + i * 36) % 360);

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
      {DEMO && <p className="demo-note">A preview with sample figures. The testnet contract is not live yet, so the buttons are off.</p>}
      {loadError && <p className="demo-note">Could not read the contract just now ({loadError}). Showing sample figures.</p>}

      <section className="hero split" aria-labelledby="mark">
        <div className="hero-grid">
          <div className="hero-copy">
            {/* red bosses in the corners, as on the Indulgence card */}
            <span className="boss tl" aria-hidden="true" />
            <span className="boss tr" aria-hidden="true" />
            <span className="boss bl" aria-hidden="true" />
            <span className="boss br" aria-hidden="true" />
            <h1 id="mark">
              <span className="sr-only">Consume: </span>Where memecoins go to be eaten.
            </h1>
            <p className="hero-explain">
              A memecoin on NEAR, backed by every memecoin it eats. Feed it yours from any chain, earn $CONSUME, and burn
              $CONSUME any time for your share of the pile.
            </p>
            <ol className="howto" aria-label="How it works">
              <li>
                <CoinsEmblem />
                <b>I</b>
                <span>Feed it a memecoin</span>
                <i>DOGE, PEPE and eight more</i>
              </li>
              <li>
                <Seal size={40} />
                <b>II</b>
                <span>Get an Indulgence</span>
                <i>an NFT that pays you</i>
              </li>
              <li>
                <HourglassEmblem />
                <b>III</b>
                <span>Collect $CONSUME</span>
                <i>a little each day for 30 days</i>
              </li>
              <li>
                <ScalesEmblem />
                <b>IV</b>
                <span>Redeem for memecoins</span>
                <i>burn $CONSUME, take your share</i>
              </li>
            </ol>
            <div className="hero-actions">
              <a className="press big" href="#feed">
                Feed the Serpent
              </a>
              <a className="text-link" href="#rule">
                <span aria-hidden="true">☞</span> How it works
              </a>
            </div>
          </div>
          <div className="hero-art">
            <Woodblock>
              <div className="hero-sigil">
                <Glory />
                <Ouroboros animate />
                {THE_TEN.map((h, i) => (
                  <span
                    key={h.symbol}
                    className="float-coin"
                    style={{
                      ["--a" as string]: `${ORBIT[i]}deg`,
                      ["--tilt" as string]: `${(i % 2 ? 1 : -1) * (6 + (i % 4) * 4)}deg`,
                      ["--delay" as string]: `${-i * 0.7}s`,
                      ["--i" as string]: i,
                    }}
                    aria-hidden="true"
                  >
                    <Coin symbol={h.symbol} chain={h.chain} size={64} />
                  </span>
                ))}
                <p className="wordmark" aria-hidden="true">
                  Consume
                </p>
              </div>
            </Woodblock>
          </div>
          <div className="floor" aria-hidden="true" />
        </div>
        {/* the tally: four figures on a black band */}
        <dl className="tally">
          <div className="tile">
            <dt>Eaten so far</dt>
            <dd className="value">{usdCompact(snap.stats.total_eaten_usd)}</dd>
            <dd className="note">across ten memecoins</dd>
          </div>
          <div className="tile">
            <dt>Backing per $CONSUME</dt>
            <dd className="value">{floorLabel}</dd>
            <dd className="note">what one $CONSUME redeems for now</dd>
          </div>
          <div className="tile">
            <dt>$CONSUME per $1 fed</dt>
            <dd className="value">{fromRaw(snap.stats.current_rate, CONSUME_DEC, 0)}</dd>
            <dd className="note">halves at {usdCompact(snap.stats.next_halving_at_usd)} eaten, so early pays most</dd>
          </div>
          <div className="tile feast">
            <dt>This week&apos;s feast</dt>
            {feast ? (
              <dd className="value">
                <Coin symbol={feast} size={44} />
                {feast}
              </dd>
            ) : (
              <dd className="value">None yet</dd>
            )}
            <dd className="note">{feast ? `${feast} feedings earn ${bonusX}× $CONSUME` : "next week, the most fed memecoin earns extra"}</dd>
          </div>
        </dl>
      </section>

      <section className="chapter" id="crucible" aria-labelledby="crucible-h">
        <header>
          <StomachEmblem />
          <h2 id="crucible-h">The Serpent’s Stomach</h2>
          <p>Everything it has eaten. It backs every $CONSUME, and only redeeming takes it out.</p>
        </header>
        <div className="crucible-layout">
          <div>
            <Stomach jars={held.map(({ h, t, micro }) => ({ symbol: h.symbol, usd: Number(micro) / 1e6, open: t?.open ?? false }))} />
          </div>
          <div>
            <table className="ledger">
              <caption>The ten memecoins it will eat, and what it holds of each.</caption>
              <thead>
                <tr>
                  <th scope="col">Memecoin</th>
                  <th scope="col">Held</th>
                  <th scope="col">Worth</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                {held.map(({ h, t, micro }) => (
                  <tr key={h.symbol}>
                    <td>
                      <span className="with-coin">
                        <Coin symbol={h.symbol} size={30} />
                        <span className="sym">{h.symbol}</span>
                        <span className="chain">from {h.chain}</span>
                        {t && !t.open && <em className="tag">sealed</em>}
                      </span>
                    </td>
                    <td>{t ? compact(t.stomach, t.decimals) : "0"}</td>
                    <td>{usd(micro, 0)}</td>
                    <td className={t?.open ? "" : "closed"}>{t ? priceLabel(t.price_e18) : "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="held">
              <span>Held now, after redemptions</span>
              <strong>{usd(totalMicro, 0)}</strong>
            </div>
            <div className="held">
              <span>Backing for each $CONSUME</span>
              <strong className="rubric">{floorLabel}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="chapter" id="chains" aria-labelledby="chains-h">
        <header>
          <h2 id="chains-h">From any chain</h2>
          <p>NEAR Intents brings memecoins from Dogecoin, Ethereum and Solana to NEAR, so one contract can eat them all.</p>
        </header>
        <Chains />
      </section>

      <section className="chapter band band-red" id="feed" aria-labelledby="feed-h">
        <header>
          <CoinsEmblem />
          <h2 id="feed-h">Feed the Serpent</h2>
          <p>Pick a memecoin, feed it, get an Indulgence.</p>
          <aside className="marginal">
            <span aria-hidden="true">☞</span> {MOCK_INTENTS ? "New? Bring test memecoins in from their chains first." : "New? Get test memecoins from the faucet first."}
          </aside>
        </header>
        <Feed snap={snap} tick={tick} onDone={done} />
      </section>

      <section className="chapter band band-ink" id="writs" aria-labelledby="writs-h">
        <header>
          <HourglassEmblem />
          <h2 id="writs-h">Your Indulgences</h2>
          <p>NFTs that pay you $CONSUME over 30 days.</p>
          <aside className="marginal">
            <span aria-hidden="true">☞</span> The card is the NFT. Sell it and the payout goes with it.
          </aside>
        </header>
        <Indulgences snap={snap} tick={tick} onDone={done} />
      </section>

      <section className="chapter after-band" id="transmute" aria-labelledby="transmute-h">
        <header>
          <ScalesEmblem />
          <h2 id="transmute-h">Redeem</h2>
          <p>Burn $CONSUME, get memecoins back.</p>
        </header>
        <Redeem snap={snap} tick={tick} onDone={done} />
        {VIA_INTENTS && <IntentsWallet snap={snap} tick={tick} onDone={done} />}
      </section>

      <section className="chapter" id="ledger" aria-labelledby="ledger-h">
        <header>
          <QuillEmblem />
          <h2 id="ledger-h">The Ledger</h2>
          <p>Latest feedings.</p>
        </header>
        <Entries recent={snap.recent} />
      </section>

      <section className="chapter band band-ink invert" id="rule" aria-labelledby="rule-h">
        <header>
          <BookEmblem />
          <h2 id="rule-h">The Rule</h2>
          <p>All enforced by the contract.</p>
        </header>
        <Rule snap={snap} />
      </section>

      <footer className="colophon invert">
        <span>
          Built at NEAR HACKATHON. {NETWORK === "mainnet"
            ? "Running on NEAR mainnet."
            : MOCK_INTENTS
              ? "Running on NEAR testnet, with a stand-in for NEAR Intents that simulates deposits and withdrawals."
              : "Running on NEAR testnet with stand-in memecoins from a faucet."}
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
        <span>
          <b>C</b>onsume
        </span>
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
  // NEAR Intents balances need no registration
  if (VIA_INTENTS) return [];
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
    BigInt(
      VIA_INTENTS
        ? await view<string>(INTENTS_CONTRACT, "mt_balance_of", { account_id: accountId, token_id: intentsToken(token) })
        : await view<string>(token, "ft_balance_of", { account_id: accountId }),
    ),
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
      const whole = Number(h.faucetWhole).toLocaleString("en-US");
      if (MOCK_INTENTS) {
        const [r] = await send([
          {
            receiverId: INTENTS_CONTRACT,
            methodName: "simulate_deposit",
            args: { token_id: intentsToken(token), from_chain: h.chain },
            gas: TGAS(30),
          },
        ]);
        if (r.failure) throw new Error(r.failure);
        onDone(`${whole} test ${h.symbol} arrived in your NEAR Intents balance${h.chain === "NEAR" ? "" : ` from ${h.chain}`}.`, r.hash);
        return;
      }
      const [r] = await send([{ receiverId: token, methodName: "faucet", args: {}, gas: TGAS(30) }]);
      if (r.failure) throw new Error(r.failure);
      onDone(`The faucet gave you ${whole} test ${h.symbol}.`, r.hash);
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
      calls.push(
        VIA_INTENTS
          ? {
              receiverId: INTENTS_CONTRACT,
              methodName: "mt_transfer_call",
              args: { receiver_id: CONSUME_CONTRACT, token_id: intentsToken(token), amount: raw.toString(), msg },
              deposit: ONE_YOCTO,
              gas: TGAS(150),
            }
          : {
              receiverId: token,
              methodName: "ft_transfer_call",
              args: { receiver_id: CONSUME_CONTRACT, amount: raw.toString(), msg },
              deposit: ONE_YOCTO,
              gas: TGAS(150),
            },
      );
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

  const quoteUsd = quote ? usd(quote.meal_usd) : raw && tribe ? usd(usdValue(raw, h.decimals, tribe.price_e18)) : "$0.00";

  return (
    <div className="leaf offering">
      <div className="feed-main">
        <div className="receipt" aria-live="polite">
          <div className="give">
            <span className="r-label">You feed it</span>
            <div className="field-row">
              <label className="sr-only" htmlFor="amount">
                Amount of {h.symbol}
              </label>
              <input
                id="amount"
                className="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Amount"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                aria-describedby="amount-help"
              />
              <span className="r-token">
                <Coin symbol={h.symbol} size={40} />
                {h.symbol}
              </span>
            </div>
            <span id="amount-help" className="r-sub">
              Worth {quoteUsd}.
              {balance !== null && (
                <>
                  {" "}
                  You hold {fromRaw(balance, h.decimals)}
                  {VIA_INTENTS ? " on NEAR Intents" : ""}.{" "}
                  <button
                    className="link-button"
                    type="button"
                    disabled={!balance}
                    onClick={() => setAmount(fromRaw(balance, h.decimals, h.decimals).replace(/,/g, ""))}
                  >
                    use all
                  </button>
                </>
              )}
            </span>
          </div>
          <span className="r-hand" aria-hidden="true">
            ☞
          </span>
          <div className="get">
            <span className="r-label">You get</span>
            <span className={quote ? "r-amount" : "r-amount empty"}>{quote ? fromRaw(quote.consume, CONSUME_DEC, 0) : "nothing yet"}</span>
            <span className="r-sub">
              {quote ? "" : "paid in "}$CONSUME over 30 days{quote?.bonus ? ", feast bonus included" : ""}
            </span>
          </div>
        </div>

        <div className="verdict-line">
          {shownError ? (
            <p className="error">{shownError}</p>
          ) : over ? (
            <p className="error">That is more {h.symbol} than you hold.</p>
          ) : quote && BigInt(quote.refund) > BigInt(0) ? (
            <p>
              Only {fromRaw(quote.accepted, h.decimals)} {h.symbol} fits in one feeding; {fromRaw(quote.refund, h.decimals)} comes back to you.
            </p>
          ) : q.loading ? (
            <p className="hint">Asking what it pays…</p>
          ) : !quote ? (
            <p className="hint">Enter an amount.</p>
          ) : (
            <p className="hint">Fed memecoins stay in the Stomach for good.</p>
          )}
        </div>

        <div className="actions">
          {accountId ? (
            <button className="press big" disabled={DEMO || busy || !quote || over} onClick={feed}>
              {busy ? "Waiting for the wallet" : "Feed the Serpent"}
            </button>
          ) : (
            <button className="press big" disabled={DEMO} onClick={connect}>
              Connect wallet to feed
            </button>
          )}
          {NETWORK === "testnet" && (
            <button className="small-button" disabled={DEMO || busy || !accountId} onClick={faucet}>
              {MOCK_INTENTS ? (h.chain === "NEAR" ? `Deposit test ${h.symbol}` : `Bring test ${h.symbol} from ${h.chain}`) : `Get test ${h.symbol}`}
            </button>
          )}
        </div>

        <details className="fine">
          <summary>Limits and storage</summary>
          <p>
            Largest single feeding of {h.symbol}: {tribe ? usd(tribe.max_meal_usd, 0) : "n/a"}; anything over it comes back to you. Each
            Indulgence takes a little NEAR for storage, paid from a refundable credit
            {credit.data !== undefined ? ` (yours: ${fromRaw(credit.data, 24, 3)} NEAR)` : ""}. Your first feeding adds 0.1 NEAR to it.{" "}
            {credit.data !== undefined && credit.data > BigInt(0) && (
              <button className="link-button" disabled={busy} onClick={withdrawCredit}>
                Take back unused credit
              </button>
            )}
          </p>
        </details>
      </div>

      <fieldset className="coin-picker">
        <legend>Which memecoin</legend>
        {THE_TEN.map((x) => {
          const t = snap.tribes.find(([k]) => k === tokenAccount(x))?.[1];
          return (
            <label key={x.symbol} title={t?.open ? `${x.symbol} from ${x.chain}` : `${x.symbol} is sealed for now`}>
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
              <Coin symbol={x.symbol} size={52} />
              <span>{x.symbol}</span>
            </label>
          );
        })}
      </fieldset>
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
  const vests = DEMO ? DEMO_MINE.map((id) => snap.recent.find((v) => v.token_id === id)!) : live.data;

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
  if (vests.length === 0) return <p className="empty">You hold no Indulgences yet. Feed the Serpent to receive one.</p>;

  return (
    <>
      {error && <p className="demo-note">{error}</p>}
      <div className="ind-list">
        {vests.map((v) => {
          const h = heresyForToken(v.vest.tribe);
          const frac = vestedFraction(v.vest.start_ns, v.vest.duration_ns);
          const left = daysLeft(v.vest.start_ns, v.vest.duration_ns);
          const claimable = BigInt(v.claimable);
          const locked = BigInt(v.locked);
          const forfeit = locked - (BigInt(v.exit_payout) - claimable);
          const ends = new Date(Number((BigInt(v.vest.start_ns) + BigInt(v.vest.duration_ns)) / BigInt(1_000_000)));
          return (
            <article key={v.token_id} className={v.vest.exited ? "ind broken" : "ind"}>
              {/* the NFT's own image, exactly as wallets and marketplaces show it */}
              <a className="ind-card-link" href={`/indulgence/${v.token_id}.svg`} target="_blank" rel="noreferrer" title="Open the card full size">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="ind-card"
                  src={`/indulgence/${v.token_id}.svg?v=${tick}`}
                  width={CARD_W}
                  height={CARD_H}
                  alt={`Indulgence ${v.token_id}, the NFT card. Opens full size.`}
                />
              </a>
              <div className="ind-body">
                <h3>
                  Indulgence <span className="no">№ {v.token_id}</span>
                </h3>
                <p className="ind-meal">
                  {h && <Coin symbol={h.symbol} size={26} />}
                  {h ? compact(v.vest.eaten, h.decimals) : v.vest.eaten} {h?.symbol} fed, worth {usd(v.vest.meal_usd)}
                  {v.vest.bonus ? ", at a feast" : ""}
                </p>

                {v.vest.exited ? (
                  <p className="ind-claim">
                    <span className="label">Seal broken</span>
                    <span className="small">Its holder took the early payout; the rest was never minted.</span>
                  </p>
                ) : (
                  <>
                    <p className="ind-claim">
                      <span className="label">Ready to collect</span>
                      <span className="big" suppressHydrationWarning>
                        {fromRaw(claimable, CONSUME_DEC, 0)}
                      </span>
                      <span className="unit">$CONSUME</span>
                    </p>
                    <dl className="ind-facts">
                      <div>
                        <dt>In total</dt>
                        <dd>{fromRaw(v.vest.total, CONSUME_DEC, 0)}</dd>
                      </div>
                      <div>
                        <dt>Released</dt>
                        <dd suppressHydrationWarning>{Math.round(frac * 100)}%</dd>
                      </div>
                      <div>
                        <dt>Fully released</dt>
                        <dd suppressHydrationWarning>
                          {left > 0 ? ends.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "now"}
                        </dd>
                      </div>
                    </dl>
                    <div
                      className="sand"
                      suppressHydrationWarning
                      role="progressbar"
                      aria-valuenow={Math.round(frac * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Released so far"
                    >
                      <span style={{ width: `${frac * 100}%` }} suppressHydrationWarning />
                    </div>
                    <div className="actions">
                      <button
                        className="press"
                        disabled={DEMO || claimable === BigInt(0) || busyId === v.token_id}
                        onClick={() => act(v.token_id, "claim", `Collected ${fromRaw(claimable, CONSUME_DEC, 0)} $CONSUME.`)}
                      >
                        Collect
                      </button>
                    </div>
                    {locked > BigInt(0) && (
                      <div className="ind-break">
                        {confirmBreak === v.token_id ? (
                          <button
                            className="small-button danger"
                            disabled={busyId === v.token_id}
                            onClick={() => act(v.token_id, "exit", `Seal broken. Received ${fromRaw(v.exit_payout, CONSUME_DEC, 0)} $CONSUME.`)}
                          >
                            Yes, break it
                          </button>
                        ) : (
                          <button className="small-button" disabled={DEMO} onClick={() => setConfirmBreak(v.token_id)}>
                            Break the seal early
                          </button>
                        )}
                        <span suppressHydrationWarning>
                          Take {fromRaw(v.exit_payout, CONSUME_DEC, 0)} now and forfeit {fromRaw(forfeit, CONSUME_DEC, 0)}.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- redeem

const EXAMPLE_REDEEM = BigInt(100_000) * BigInt(10) ** BigInt(18);

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
  const balance = bal.data ?? null;
  // Before an amount is typed, preview what all of your $CONSUME (or a sample
  // amount) would take, so the panel shows what redeeming is worth.
  const typed = raw !== null && raw > BigInt(0);
  const preview = typed ? raw! : balance && balance > BigInt(0) ? balance : EXAMPLE_REDEEM;
  const q = useLive(`redeem:${preview}:${tick}`, async () => {
    if (DEMO) {
      const d = BigInt(snap.stats.consume_supply) + BigInt(snap.stats.total_unvested);
      return { shares: snap.tribes.map(([k, t]) => [k, ((BigInt(t.stomach) * preview) / d).toString()] as [string, string]), denominator: d.toString() };
    }
    if (typed) await sleep(300);
    return view<RedeemQuote>(CONSUME_CONTRACT, "quote_redeem", { amount: preview.toString() });
  });
  const quote = q.data ?? null;
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
    if (!typed || !raw || !quote || !accountId) return;
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
      await afterPayout(results, `Redeemed ${fromRaw(raw, CONSUME_DEC, 0)} $CONSUME for ${usd(totalMicro)} of memecoins.`);
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

  const shares = quote?.shares.filter(([, v]) => BigInt(v) > BigInt(0)) ?? [];

  return (
    <div className="leaf transmute redeem">
      <div className="redeem-in">
        <div className="field">
          <label htmlFor="burn-amount">$CONSUME to burn</label>
          <div className="field-row">
            <input
              id="burn-amount"
              className="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Amount"
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
            {accountId && balance !== null
              ? `You hold ${fromRaw(balance, CONSUME_DEC, 0)} $CONSUME.`
              : "Collect $CONSUME from your Indulgences first, then burn it here."}
          </span>
        </div>
        {(shownError || over) && <p className="error">{shownError ?? "That is more $CONSUME than you hold."}</p>}
        <div className="actions">
          <button className="press big" disabled={DEMO || busy || !typed || !quote || over || !accountId} onClick={redeem}>
            {busy ? "Waiting for the wallet" : "Burn and redeem"}
          </button>
          {owed.length > 0 && (
            <button className="small-button" disabled={busy} onClick={retry}>
              Retry {owed.length} unpaid {owed.length === 1 ? "share" : "shares"}
            </button>
          )}
        </div>
        <p className="hint">Locked $CONSUME counts too, so nobody can empty it first.</p>
      </div>

      <div className="redeem-out" aria-live="polite">
        <span className="r-label">
          {typed ? "You receive" : balance && balance > BigInt(0) ? "All your $CONSUME takes" : `For example, ${fromRaw(EXAMPLE_REDEEM, CONSUME_DEC, 0)} $CONSUME takes`}
        </span>
        <span className="r-amount">{usd(totalMicro)}</span>
        <span className="r-sub">{VIA_INTENTS ? "paid in memecoins to your NEAR Intents balance" : "paid in memecoins"}</span>
        {shares.length > 0 ? (
          <ul className="basket">
            {shares.map(([k, v]) => {
              const h = heresyForToken(k);
              return (
                <li key={k}>
                  {h && <Coin symbol={h.symbol} size={30} />}
                  <span className="s">{h?.symbol ?? k}</span>
                  <span className="n">{h ? compact(v, h.decimals) : v}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hint">{q.loading ? "Weighing the Stomach…" : "The Stomach is empty, so there is nothing to take yet."}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ledger

function Entries({ recent }: { recent: VestView[] }) {
  if (recent.length === 0) return <p className="empty">Nothing has been fed yet. The first feeding will be written here.</p>;
  return (
    <table className="book">
      <caption className="sr-only">The latest feedings</caption>
      <thead>
        <tr>
          <th scope="col">No.</th>
          <th scope="col">Memecoin</th>
          <th scope="col">Fed by</th>
          <th scope="col" className="num">Amount</th>
          <th scope="col" className="num">Worth</th>
          <th scope="col" className="num">$CONSUME</th>
          <th scope="col">Date</th>
        </tr>
      </thead>
      <tbody>
        {recent.slice(0, 8).map((v) => {
          const h = heresyForToken(v.vest.tribe);
          const when = new Date(Number(BigInt(v.vest.start_ns) / BigInt(1_000_000)));
          return (
            <tr key={v.token_id} className={v.vest.exited ? "broken" : ""}>
              <td className="no">{v.token_id}</td>
              <td>
                <span className="meme">
                  {h && <Coin symbol={h.symbol} size={26} />}
                  <span>{h?.symbol}</span>
                  {v.vest.bonus && <em className="tag">feast</em>}
                  {v.vest.exited && <em className="tag">seal broken</em>}
                </span>
              </td>
              <td>{shortAccount(v.owner_id)}</td>
              <td className="num">{h ? compact(v.vest.eaten, h.decimals) : ""}</td>
              <td className="num">{usd(v.vest.meal_usd, 0)}</td>
              <td className="num">{fromRaw(v.vest.total, CONSUME_DEC, 0)}</td>
              <td>{when.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- the rule

function Rule({ snap }: { snap: Snapshot }) {
  const c = snap.config;
  const days = Number(BigInt(c.vest_duration_ns) / BigInt(86_400_000_000_000));
  const haircut = c.exit_haircut_bps / 100;
  return (
    <>
      <ol className="steps">
        <li>
          <b>I</b>
          <h3>Feed</h3>
          <p>
            {c.start_rate} $CONSUME per dollar to start, halved every {usd(c.halving_usd, 0)} eaten. Early feeders earn most.
          </p>
        </li>
        <li>
          <b>II</b>
          <h3>Release</h3>
          <p>
            Paid out over {days} days. Break the seal early and lose {haircut}% of what is still locked.
          </p>
        </li>
        <li>
          <b>III</b>
          <h3>Redeem</h3>
          <p>
            Burn $CONSUME for your share of the Stomach, paid in memecoins. Nothing else takes them out.
          </p>
        </li>
      </ol>

      <div className="trust">
        <h3>Who you trust</h3>
        <p>
          <strong>The Assayer</strong> sets prices from NEAR Intents quotes. A bad price can overpay, up to each memecoin&apos;s daily limit.
        </p>
        <p>
          <strong>The owner</strong> can add memecoins, set limits and swap the Assayer, but cannot withdraw. It passes to a DAO after launch.
        </p>
        <p>
          <strong>NEAR Intents</strong> holds the memecoins that arrive through it, in the Stomach&apos;s own balance. The owner cannot
          switch to a different Intents contract once it has eaten.
        </p>
      </div>

      <details className="all-rules">
        <summary>All the rules</summary>
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
              Fed memecoins never leave except through redemption. Burning $CONSUME pays your share of every memecoin inside, measured against all $CONSUME
              including what is still locked in Indulgences.
            </p>
          </div>
          <div>
            <h3>Feasts and limits</h3>
            <p>
              The memecoin fed most in a week pays {c.heaviest_bonus_bps / 100}% the next week. Each memecoin has a largest feeding and a daily limit; thin
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
              The owner can add memecoins, change limits, seal a memecoin and replace the Assayer, but has no way to withdraw from the Stomach. A bad
              owner could still list a fake token or appoint a dishonest Assayer, so the owner role is meant to pass to a DAO, and the contract
              account&apos;s keys to be deleted once it is set up.
            </p>
          </div>
        </div>
      </details>
    </>
  );
}
