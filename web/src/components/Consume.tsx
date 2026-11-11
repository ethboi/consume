"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { HERESIES as THE_TEN, printed } from "@/lib/heresies";
import { cardData } from "@/lib/bond-card";
import { DEMO_MINE, DEMO_NOW_MS } from "@/lib/demo";
import {
  CONSUME_CONTRACT,
  DEMO,
  EXPLORER,
  INTENTS_CONTRACT,
  MEAL_TOO_SMALL,
  MOCK_INTENTS,
  NETWORK,
  VIA_INTENTS,
  cleanError,
  daoCouncil,
  fullAccessKeys,
  heresyForToken,
  intentsToken,
  loadSnapshot,
  nearBalance,
  tokenAccount,
  view,
  type MealQuote,
  type RedeemQuote,
  type Snapshot,
  type VestView,
} from "@/lib/near";
import { compact, daysLeft, fromRaw, shortAccount, toRaw, usd, usdCompact, usdValue, vestedFraction } from "@/lib/format";
import { Ouroboros, SerpentHead } from "./Ouroboros";
import { Stomach } from "./Stomach";
import { Coin, ConsumeCoin } from "./Coin";
import { CARD_H, CARD_W } from "./BondCard";
import { Chains } from "./Chains";
import { IntentsWallet } from "./IntentsWallet";
import { PartySeal, Seal } from "./Seal";
import { Glory, Woodblock } from "./Woodblock";
import { AbacusEmblem, BookEmblem, CoinsEmblem, CompassEmblem, FeedEmblem, GobletEmblem, StomachEmblem, HourglassEmblem, QuillEmblem, ScalesEmblem } from "./Emblems";
import { TGAS, eventData, eventsData, useWallet, type Call, type TxResult } from "./Wallet";
import { Feeding, SWALLOW_MS, type FeedingScene, type Meal } from "./Feeding";
import { Collecting, type CollectScene } from "./Collecting";
import { sleep, useLive } from "@/lib/live";
import { Feast } from "./Feast";
import { feastOf } from "@/lib/feast";
import { Ledger } from "./Ledger";
import { RoundFold } from "./Round";
import { Tour } from "./Tour";
import { Simulation } from "./Simulation";
import { SendBond } from "./SendBond";
import { play, setSound, soundOn, subscribeSound } from "@/lib/sound";

const ONE_YOCTO = "1";
const CONSUME_DEC = 18;
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL?.trim() || "https://github.com/ethboi/consume";
const HACKATHON_URL = "https://nearhackathon.com";
// where the ten coins hang around the serpent (degrees, 0 = right, clockwise),
// clear of the head at the top and the banner below
// ten coins evenly spaced (36° apart), one above the serpent's head and one
// below; none sits on the horizontal where the wordmark breaks past the ring
const ORBIT = Array.from({ length: 10 }, (_, i) => (270 + i * 36) % 360);

type Toast = { text: string; href?: string } | null;
/** `quiet` reloads the figures without a notice, for when the page already shows what happened. */
type Done = (text: string, hash?: string, quiet?: boolean) => void;

export function Consume({ initial, loadError }: { initial: Snapshot; loadError: string | null }) {
  const [snap, setSnap] = useState(initial);
  const [toast, setToast] = useState<Toast>(null);
  const [tick, setTick] = useState(0); // bumps after any transaction so panels reload
  // the server could not read the contract: the figures are samples, and nothing
  // may be signed against them, until a reading succeeds
  const [unread, setUnread] = useState(loadError !== null);
  const asked = useRef(0);

  const reload = useCallback(async () => {
    if (DEMO) return;
    const mine = ++asked.current;
    try {
      const fresh = await loadSnapshot();
      // two readings can be in flight: only the latest one is kept
      if (mine !== asked.current) return;
      setSnap(fresh);
      setUnread(false);
    } catch {
      // keep the last good snapshot
    }
  }, []);

  const refresh = useCallback(async () => {
    await reload();
    setTick((t) => t + 1);
  }, [reload]);

  // other people feed and redeem too: read the figures again every minute and
  // when the tab is looked at again (every few seconds while there is no reading)
  useEffect(() => {
    if (DEMO) return;
    const id = setInterval(reload, unread ? 4_000 : 60_000);
    window.addEventListener("focus", reload);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", reload);
    };
  }, [reload, unread]);

  const done: Done = useCallback(
    (text, hash, quiet) => {
      if (!quiet) {
        setToast({ text, href: hash ? `${EXPLORER}/txns/${hash}` : undefined });
        setTimeout(() => setToast(null), 9000);
      }
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
  const feastId = feastOf(snap.stats);
  const feast = feastId ? heresyForToken(feastId)?.symbol : null;

  return (
    <div className="folio">
      <Masthead tick={tick} />
      {DEMO && <p className="demo-note">A preview with sample figures. This build is not joined to a contract, so the buttons are off.</p>}
      {unread && (
        <p className="demo-note" role="status" title={loadError ?? undefined}>
          Could not read the contract just now, so the figures below are samples and feeding, Bonds and redeeming are off. Trying again
          every few seconds.
        </p>
      )}

      <section className="hero split" aria-labelledby="mark">
        <div className="hero-grid">
          <div className="hero-copy">
            {/* red bosses in the corners, as on the Bond card */}
            <span className="boss tl" aria-hidden="true" />
            <span className="boss tr" aria-hidden="true" />
            <span className="boss bl" aria-hidden="true" />
            <span className="boss br" aria-hidden="true" />
            <h1 id="mark">
              <span className="sr-only">Consume: </span>The memecoin that eats memecoins.
            </h1>
            <p className="hero-explain">
              Feed it yours from any chain. Earn $CONSUME, backed by everything it has eaten.
            </p>
            {NETWORK === "testnet" && !DEMO && (
              <p className="hero-net">
                <b>On NEAR testnet,</b> with test memecoins.
              </p>
            )}
            <ol className="howto" aria-label="How it works">
              <li>
                <CoinsEmblem />
                <b>I</b>
                <span>Feed</span>
                <i>DOGE, PEPE and eight more</i>
              </li>
              <li>
                <Seal size={40} />
                <b>II</b>
                <span>Bond</span>
                <i>an NFT that pays you</i>
              </li>
              <li>
                <HourglassEmblem />
                <b>III</b>
                <span>Collect</span>
                <i>over 30 days</i>
              </li>
              <li>
                <ScalesEmblem />
                <b>IV</b>
                <span>Redeem</span>
                <i>for your share of the Stomach</i>
              </li>
            </ol>
            <div className="hero-actions">
              <a className="press big" href="#feed">
                Feed the Serpent
              </a>
              <Tour />
            </div>
            <nav className="judge-links" aria-label="Explore the project">
              <a href="#rule">How it works</a>
              <a href="/demo">Demo: two-minute guide</a>
              <a href={REPO_URL}>Source on GitHub</a>
            </nav>
            <p className="hero-entry">
              Built for{" "}
              <a href={HACKATHON_URL} target="_blank" rel="noreferrer">
                NEAR HACKATHON
              </a>
            </p>
          </div>
          <div className="hero-art">
            <Woodblock>
              <div className="hero-sigil">
                <Glory />
                <Ouroboros />
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
                  <b>C</b>onsume
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
            <dt>Tithe on a feeding</dt>
            <dd className="value">{snap.stats.tithe_bps / 100}%</dd>
            <dd className="note">
              {snap.stats.next_famine_at_usd
                ? `kept for holders; ${Math.min(snap.config.max_tithe_bps, snap.stats.tithe_bps + snap.config.tithe_step_bps) / 100}% once ${usdCompact(snap.stats.next_famine_at_usd)} is eaten`
                : "kept for holders; it never goes higher"}
            </dd>
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
            <dd className="note">
              {feast ? `${feast} feedings pay no tithe. ` : "next week, the most fed memecoin pays no tithe. "}
              <a href="#feast">See the race</a>
            </dd>
          </div>
        </dl>
      </section>

      <section className="chapter band band-red" id="feed" aria-labelledby="feed-h" inert={unread}>
        <header>
          <FeedEmblem />
          <h2 id="feed-h">Feed the Serpent</h2>
          <p>Pick a memecoin, feed it, get a Bond.</p>
        </header>
        <Feed snap={snap} tick={tick} onDone={done} />
      </section>

      <section className="chapter band band-ink" id="bonds" aria-labelledby="bonds-h" inert={unread}>
        <header>
          <HourglassEmblem />
          <BondsHeading />
          <p>NFTs that pay you $CONSUME over 30 days. Send one and its payout goes with it.</p>
        </header>
        <Bonds snap={snap} tick={tick} onDone={done} />
        <CollectPreview />
      </section>

      <section className="chapter after-band" id="transmute" aria-labelledby="transmute-h" inert={unread}>
        <header>
          <ScalesEmblem />
          <h2 id="transmute-h">Redeem</h2>
          <p>Burn $CONSUME, get memecoins back.</p>
        </header>
        <Redeem snap={snap} tick={tick} onDone={done} />
        {VIA_INTENTS && <IntentsWallet snap={snap} tick={tick} onDone={done} />}
      </section>

      <section className="chapter" id="crucible" aria-labelledby="crucible-h">
        <header>
          <StomachEmblem />
          <h2 id="crucible-h">The Serpent’s Stomach</h2>
          <div className="stomach-total">
            <strong>{usd(totalMicro, 0)}</strong>
            <span>held now, after redemptions</span>
          </div>
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
                  <tr key={h.symbol} className={micro > BigInt(0) ? "holds" : "holds-none"}>
                    <td>
                      <span className="with-coin">
                        <Coin symbol={h.symbol} size={30} />
                        <span className="sym">{h.symbol}</span>
                        <span className="chain">
                          from {h.chain}
                          {t && <span className="price-inline">, {priceLabel(t.price_e18)} each</span>}
                        </span>
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
          </div>
          <p className="backing">
            <span className="backing-name">Backing for each $CONSUME</span>
            <span className="backing-sum">
              {denom > BigInt(0)
                ? `${usd(totalMicro, 0)} in the Stomach, shared among ${fromRaw(denom, CONSUME_DEC, 0)} $CONSUME, locked in Bonds or not`
                : "The Stomach's worth, shared among all $CONSUME, locked in Bonds or not"}
            </span>
            <strong>{floorLabel}</strong>
          </p>
        </div>
      </section>

      <section className="chapter" id="feast" aria-labelledby="feast-h">
        <header>
          <GobletEmblem />
          <h2 id="feast-h">The Feast</h2>
          <p>The most fed memecoin of the week pays no tithe the week after. None feasts two weeks running.</p>
        </header>
        <Feast snap={snap} />
      </section>

      <section className="chapter" id="chains" aria-labelledby="chains-h">
        <header>
          <CompassEmblem />
          <h2 id="chains-h">From any chain</h2>
          <p>NEAR Intents brings memecoins from Dogecoin, Ethereum and Solana to NEAR, so one contract can eat them all.</p>
        </header>
        <Chains />
      </section>

      <section className="chapter" id="ledger" aria-labelledby="ledger-h">
        <header>
          <QuillEmblem />
          <h2 id="ledger-h">The Ledger</h2>
          <p>Every feeding, every $CONSUME minted and every $CONSUME burned.</p>
        </header>
        <Ledger stats={DEMO || unread ? null : snap.stats} tick={tick} fallback={<Entries recent={snap.recent} />} />
      </section>

      <section className="chapter" id="sim" aria-labelledby="sim-h">
        <header>
          <AbacusEmblem />
          <h2 id="sim-h">The Simulation</h2>
          <p>Sixty days run four ways through the contract&apos;s own arithmetic. Every figure here is simulated.</p>
        </header>
        <Simulation repoUrl={REPO_URL} />
      </section>

      <section className="chapter band band-ink invert" id="rule" aria-labelledby="rule-h">
        <header>
          <BookEmblem />
          <h2 id="rule-h">The Rule</h2>
          <p>All enforced by the contract.</p>
        </header>
        <Rule snap={snap} />
      </section>

      <section className="entry" aria-labelledby="entry-h">
        <div className="entry-head">
          <h2 id="entry-h">Made for NEAR HACKATHON</h2>
          <p>
            CONSUME is entered in the Memecoins With Mechanics, NFTs That Do Something and Open Innovation tracks at{" "}
            <a href={HACKATHON_URL} target="_blank" rel="noreferrer">
              nearhackathon.com
            </a>
            . Try the <a href="/demo">short demo guide</a> or inspect the <a href={REPO_URL}>public source</a>.
          </p>
        </div>
      </section>

      <footer className="colophon invert">
        <span>
          Built at NEAR HACKATHON by{" "}
          <a href="https://x.com/EthBoi_" target="_blank" rel="noreferrer">
            @EthBoi_
          </a>
          . Running on NEAR {NETWORK === "mainnet" ? "mainnet" : "testnet"}.
        </span>
        <nav aria-label="More">
          {REPO_URL && <a href={REPO_URL}>GitHub</a>}
          <a href="/demo">Demo guide</a>
          <a href="/llms.txt">For agents</a>
          <a href="https://oneup.markets" title="OneUp, another project by the same builder">
            Also by @EthBoi_: OneUp
          </a>
        </nav>
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

/** The switch for sound and music. Off until the visitor turns it on; the choice is remembered. */
function SoundSwitch() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => false);
  return (
    <button
      className="sound-button"
      type="button"
      aria-pressed={on}
      aria-label="Sound and music"
      title={on ? "Sound and music are on" : "Turn on sound and music"}
      onClick={() => setSound(!on)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        {/* a hand bell */}
        <path d="M12 3.2v2M7 17c.9-1.5 1.2-3.3 1.2-5.6 0-2.9 1.5-5.2 3.8-5.2s3.8 2.3 3.8 5.2c0 2.3.3 4.1 1.2 5.6z" />
        <path d="M5.5 17h13M10.5 19.6a1.6 1.6 0 0 0 3 0" />
        {!on && <path className="mute" d="M4.5 4.5l15 15" />}
      </svg>
    </button>
  );
}

function Masthead({ tick }: { tick: number }) {
  const { accountId, ready, connect, disconnect } = useWallet();
  // what the signed-in account holds, kept in view; refreshed after every transaction
  const held = useLive(DEMO || !accountId ? null : `${accountId}:purse:${tick}`, async () =>
    BigInt(await view<string>(CONSUME_CONTRACT, "ft_balance_of", { account_id: accountId })),
  );
  const million = BigInt(1_000_000) * BigInt(10) ** BigInt(CONSUME_DEC);
  return (
    <header className="masthead">
      <a className="masthead-mark" href="#mark" aria-label="CONSUME, back to top">
        <Ouroboros size={40} solid title="" />
        <span>
          <b>C</b>onsume
        </span>
      </a>
      <nav aria-label="Sections">
        <a href="#feed">Feed</a>
        <a href="#bonds">Bonds</a>
        <a href="#transmute">Redeem</a>
        <a href="#crucible">
          <span className="nav-the">The </span>Stomach
        </a>
        <a href="#feast">
          <span className="nav-the">The </span>Feast
        </a>
        <a href="#ledger">Ledger</a>
      </nav>
      <span className="masthead-end">
        <SoundSwitch />
        {accountId ? (
          <span className="masthead-me">
            {held.data !== undefined && held.data !== null && (
              <span className="purse" title="The $CONSUME in your wallet">
                <ConsumeCoin size={26} />
                <b>{held.data >= million ? compact(held.data, CONSUME_DEC) : fromRaw(held.data, CONSUME_DEC, 0)}</b>
                <span className="sr-only"> $CONSUME in your wallet</span>
              </span>
            )}
            <button className="sign-button" onClick={disconnect} title="Sign out">
              {shortAccount(accountId)}
            </button>
          </span>
        ) : (
          <button className="sign-button" onClick={connect} disabled={!ready || DEMO} aria-label="Connect wallet">
            Connect<span className="sign-long"> wallet</span>
          </button>
        )}
      </span>
    </header>
  );
}

// ---------------------------------------------------------------- feed

const CREDIT_TOP_UP = "100000000000000000000000"; // 0.1 NEAR
const CREDIT_LOW = BigInt("30000000000000000000000"); // below 0.03 NEAR, top up
// a first feeding sends the 0.1 NEAR credit and prepays gas: under this, point to the faucet
const NEAR_LOW = BigInt("250000000000000000000000"); // 0.25 NEAR
const NEAR_FAUCET = "https://near-faucet.io/";

function demoQuote(snap: Snapshot, token: string, raw: bigint, decimals: number): MealQuote | null {
  const tribe = snap.tribes.find(([k]) => k === token)?.[1];
  if (!tribe) return null;
  const meal = usdValue(raw, decimals, tribe.price_e18);
  const cap = BigInt(tribe.max_meal_usd);
  const m = meal > cap ? cap : meal;
  // over the feeding limit the contract takes what fits and sends the rest back
  const accepted = meal > cap ? (raw * cap) / meal : raw;
  const bonus = feastOf(snap.stats) === token;
  // as the contract does it (meal.rs): the feast pays no tithe, the rest earns at the backing
  const tithe = bonus ? BigInt(0) : (m * BigInt(snap.stats.tithe_bps)) / BigInt(10_000);
  return {
    accepted: accepted.toString(),
    refund: (raw - accepted).toString(),
    meal_usd: m.toString(),
    tithe_usd: tithe.toString(),
    consume: (((m - tithe) * BigInt(snap.stats.current_rate)) / BigInt(1_000_000)).toString(),
    bonus,
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

/** Positions on the amount slider, which runs on a log scale: a dollar and a thousand both get room. */
const SLIDER_STEPS = 240;

/** What the contract logs when $CONSUME is burned for a share of the Stomach. */
type RedeemEvent = { burned: string; shares: [string, string][] };

/** What the contract logs when it eats. */
type MealEvent = { vest_id: string; eaten: string; meal_usd: string; consume: string; bonus: boolean };

/** The serpent's open jaws at the end of the slider: the coin is slid toward them. */
function Maw() {
  return (
    <svg className="ms-maw" viewBox="138 20 114 82" aria-hidden="true" fill="none" stroke="var(--ink)" color="var(--ink)" strokeLinecap="round" strokeLinejoin="round">
      {/* the neck runs off the edge of the trough */}
      <path d="M221,41 H254 V75 H221 Z" fill="var(--paper)" stroke="none" />
      <path d="M222,41 H254 M223,75 H254" strokeWidth={2.2} />
      <path d="M224,66 H254 M230,66 V75 M237,66 V75 M244,66 V75 M251,66 V75" strokeWidth={1.2} />
      <SerpentHead fill="var(--paper)" stroke={2.2} cut={1.3} open={10} />
    </svg>
  );
}

function Feed({ snap, tick, onDone }: { snap: Snapshot; tick: number; onDone: Done }) {
  const { accountId, send, connect } = useWallet();
  const [symbol, setSymbol] = useState("PEPE");
  const [amount, setAmount] = useState("");
  // what is being typed in the dollar box; null when the box just shows the worth of `amount`
  const [usdText, setUsdText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scene, setScene] = useState<FeedingScene | null>(null);
  // false once the feeder closes the sheet: the outcome then arrives as a notice instead
  const watching = useRef(false);

  const h = THE_TEN.find((x) => x.symbol === symbol)!;
  const token = tokenAccount(h);
  const tribe = snap.tribes.find(([k]) => k === token)?.[1];
  const raw = toRaw(amount, h.decimals);

  // what the feeder holds of each of the ten, so the picker can show it
  const bals = useLive(DEMO || !accountId ? null : `${accountId}:held:${tick}`, async () => {
    const tokens = THE_TEN.map(tokenAccount);
    const held = VIA_INTENTS
      ? await view<string[]>(INTENTS_CONTRACT, "mt_batch_balance_of", { account_id: accountId, token_ids: tokens.map(intentsToken) })
      : await Promise.all(tokens.map((t) => view<string>(t, "ft_balance_of", { account_id: accountId }).catch(() => "0")));
    return Object.fromEntries(tokens.map((t, i) => [t, BigInt(held[i] ?? "0")])) as Record<string, bigint>;
  });
  const credit = useLive(DEMO || !accountId ? null : `${accountId}:credit:${tick}`, async () =>
    BigInt((await view<string>(CONSUME_CONTRACT, "get_meal_credit", { account_id: accountId })) ?? "0"),
  );
  const q = useLive(raw && raw > BigInt(0) ? `${token}:${raw}:${tick}` : null, async () => {
    if (DEMO) return demoQuote(snap, token, raw!, h.decimals);
    await sleep(300); // debounce typing; superseded keys are ignored by useLive
    return view<MealQuote>(CONSUME_CONTRACT, "quote_meal", { token_id: token, amount: raw!.toString() });
  });
  const quote = q.data ?? null;
  const balance = bals.data ? (bals.data[token] ?? BigInt(0)) : null;
  // fees and storage are paid in NEAR; a fresh testnet wallet may hold none
  const near = useLive(DEMO || !accountId || NETWORK !== "testnet" ? null : `${accountId}:near:${tick}`, () => nearBalance(accountId!));
  const nearLow = near.data !== undefined && near.data < NEAR_LOW;

  const closeScene = useCallback(() => {
    watching.current = false;
    setScene(null);
  }, []);

  /** The Bond's card as it will print, from what the contract said it ate. */
  const sceneCard = (ev: MealEvent, startMs: number) =>
    cardData(
      ev.vest_id,
      {
        tribe: token,
        eaten: ev.eaten,
        meal_usd: ev.meal_usd,
        total: ev.consume,
        released: "0",
        start_ns: (BigInt(startMs) * BigInt(1_000_000)).toString(),
        duration_ns: snap.config.vest_duration_ns,
        exited: false,
        bonus: ev.bonus,
      },
      h,
      0,
    );

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
    const meal: Meal = { symbol: h.symbol, chain: h.chain, amount: fromRaw(quote.accepted, h.decimals), worth: usd(quote.meal_usd) };
    setBusy(true);
    setError(null);
    watching.current = true;
    setScene({ stage: "waiting", meal });
    try {
      const calls = [];
      if ((credit.data ?? BigInt(0)) < CREDIT_LOW) {
        calls.push({ receiverId: CONSUME_CONTRACT, methodName: "add_meal_credit", args: {}, deposit: CREDIT_TOP_UP, gas: TGAS(10) });
      }
      // refuse a feeding counted at under 99% of the quoted value after the tithe, or one
      // that lands after ten minutes. The count of $CONSUME is not pinned: it moves with
      // the rest of the Stomach while the wallet is open, and what backs it moves the other way.
      const msg = JSON.stringify({
        min_net_usd: (((BigInt(quote.meal_usd) - BigInt(quote.tithe_usd)) * BigInt(99)) / BigInt(100)).toString(),
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
      const ev = eventData<MealEvent>(results, "meal");
      if (!ev) {
        throw new Error(`It refused the feeding and your ${h.symbol} was returned${last.failure ? `: ${last.failure}` : "."}`);
      }
      setAmount("");
      setUsdText(null);
      const eaten = fromRaw(ev.eaten ?? quote.accepted, h.decimals);
      const notice = `Fed ${eaten} ${h.symbol} to the Stomach. Your Bond is minted.`;
      if (!watching.current) {
        onDone(notice, last.hash);
        return;
      }
      onDone(notice, last.hash, true); // reload the page's figures; the sheet says the rest
      setScene({ stage: "swallowing", meal: { ...meal, amount: eaten } });
      await sleep(SWALLOW_MS);
      if (watching.current) {
        setScene({ stage: "bond", meal: { ...meal, amount: eaten }, card: sceneCard(ev, Date.now()), href: `${EXPLORER}/txns/${last.hash}` });
      }
    } catch (e) {
      const reason = cleanError(e);
      setError(reason);
      if (watching.current) setScene({ stage: "refused", meal, reason });
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

  // amounts in dollars, because nobody knows how many PEPE make fifty dollars
  const price = tribe ? Number(BigInt(tribe.price_e18)) / 1e18 : 0;
  const capUsd = tribe ? Number(BigInt(tribe.max_meal_usd)) / 1e6 : 0;
  const minUsd = Number(BigInt(snap.config.min_meal_usd ?? "1000000")) / 1e6;
  const refusal = error ?? q.error ?? null;
  const shownError = refusal === MEAL_TOO_SMALL ? `The smallest feeding is $${minUsd.toLocaleString("en-US")} of ${h.symbol}.` : refusal;
  const amountFor = (dollars: number) => {
    const n = dollars / price;
    const d = Math.min(h.decimals, n >= 1e6 ? 0 : n >= 1000 ? 2 : 6);
    // round up so the feeding is worth the full amount, except at the limit, where a hair over would be refunded
    const round = dollars >= capUsd ? Math.floor : Math.ceil;
    return (round(n * 10 ** d) / 10 ** d).toFixed(d);
  };
  const feastToken = feastOf(snap.stats);
  const mealUsd = raw && tribe ? Number(usdValue(raw, h.decimals, tribe.price_e18)) / 1e6 : 0;

  // the slider: position 0 is the smallest feeding, the last position the most one feeding takes,
  // or everything the feeder holds when that is less, so it can never pick more than they have
  const heldUsd = balance !== null && tribe ? Number(usdValue(balance, h.decimals, tribe.price_e18)) / 1e6 : null;
  const allHeld = heldUsd !== null && heldUsd < capUsd;
  const topUsd = allHeld ? heldUsd : capUsd;
  const canSlide = price > 0 && topUsd > minUsd;
  const span = canSlide ? Math.log(topUsd / minUsd) : 1;
  const posOf = (dollars: number) => Math.min(SLIDER_STEPS, Math.max(0, Math.round((SLIDER_STEPS * Math.log(dollars / minUsd)) / span)));
  const usdAt = (pos: number) => {
    if (pos >= SLIDER_STEPS) return topUsd;
    if (pos <= 0) return minUsd;
    const v = minUsd * Math.exp((span * pos) / SLIDER_STEPS);
    // land on round sums: halves under $10, whole dollars under $100, then fives and tens
    const step = v < 10 ? 0.5 : v < 100 ? 1 : v < 250 ? 5 : 10;
    return Math.min(topUsd, Math.max(minUsd, Math.round(v / step) * step));
  };
  const pos = canSlide && mealUsd > 0 ? posOf(mealUsd) : 0;
  const marks = canSlide
    ? [...new Set([minUsd, ...[10, 100, 1000].filter((v) => v > minUsd * 2 && v < topUsd * (allHeld ? 0.4 : 0.6)), topUsd])]
    : [];
  const setDollars = (dollars: number) => {
    const picked = amountFor(dollars);
    // at the end of a slider that stops at the feeder's holding, feed exactly what they hold
    const all = allHeld && balance !== null && (dollars >= topUsd || (toRaw(picked, h.decimals) ?? BigInt(0)) > balance);
    setAmount(all ? fromRaw(balance, h.decimals, h.decimals).replace(/,/g, "") : picked);
    setUsdText(null);
    setError(null);
  };
  const usdShown = usdText ?? (mealUsd > 0 ? mealUsd.toFixed(2).replace(/\.00$/, "") : "");

  // ?preview=feeding plays the sheet with sample figures, so it can be seen without sending anything
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preview") !== "feeding" || !tribe || !price) return;
    let alive = true;
    (async () => {
      const sample = toRaw(amountFor(Math.min(50, capUsd)), h.decimals)!;
      const sq = demoQuote(snap, token, sample, h.decimals)!;
      const meal: Meal = { symbol: h.symbol, chain: h.chain, amount: fromRaw(sq.accepted, h.decimals), worth: usd(sq.meal_usd) };
      await sleep(500);
      if (!alive) return;
      watching.current = true;
      setScene({ stage: "waiting", meal });
      await sleep(2600);
      if (!alive || !watching.current) return;
      setScene({ stage: "swallowing", meal });
      await sleep(SWALLOW_MS);
      if (!alive || !watching.current) return;
      const ev: MealEvent = { vest_id: String(Number(snap.stats.vests_minted) + 1), eaten: sq.accepted, meal_usd: sq.meal_usd, consume: sq.consume, bonus: sq.bonus };
      setScene({ stage: "bond", meal, card: sceneCard(ev, Date.now()), preview: true });
    })();
    return () => {
      alive = false;
    };
    // played once, with whatever the page first loaded
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="leaf offering">
      <div className="feed-pick">
        <fieldset className="pick">
          <legend>Which memecoin</legend>
          {THE_TEN.map((x) => {
            const t = snap.tribes.find(([k]) => k === tokenAccount(x))?.[1];
            const held = bals.data ? (bals.data[tokenAccount(x)] ?? BigInt(0)) : null;
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
                    setUsdText(null);
                    setError(null);
                  }}
                />
                <span className="pick-coin">
                  <Coin symbol={x.symbol} size={52} />
                </span>
                <span className={x.symbol.length > 8 ? "pick-name long" : "pick-name"}>{printed(x.symbol)}</span>
                {held !== null && (
                  <span className={held > BigInt(0) ? "pick-held" : "pick-held none"}>
                    <span className="sr-only">You have </span>
                    {held > BigInt(0) ? compact(held, x.decimals) : "none"}
                  </span>
                )}
                {feastToken === tokenAccount(x) && <em className="pick-tag">feast</em>}
              </label>
            );
          })}
        </fieldset>
        <p className="pick-about">
          <strong>{h.symbol}</strong> lives on {h.chain}.
          {tribe ? ` The Serpent takes up to ${usd(tribe.max_meal_usd, 0)} of it in one feeding.` : ""}
          {feastToken === token ? " It is this week’s feast, so it pays no tithe." : ""}
        </p>
        {NETWORK === "testnet" && (
          <p className="pick-foot">
            <span>No {h.symbol} yet?</span>
            <button className="small-button" disabled={DEMO || busy || !accountId} onClick={faucet}>
              {MOCK_INTENTS ? (h.chain === "NEAR" ? `Deposit test ${h.symbol}` : `Bring test ${h.symbol} from ${h.chain}`) : `Get test ${h.symbol}`}
            </button>
          </p>
        )}
        {NETWORK === "testnet" && nearLow && (
          <p className="pick-fees low">
            Your wallet holds {fromRaw(near.data!, 24)} NEAR. A first feeding needs about 0.2 for fees and storage.{" "}
            <a href={NEAR_FAUCET} target="_blank" rel="noreferrer">
              Get free testnet NEAR at near-faucet.io
            </a>
            .
          </p>
        )}
      </div>

      <div className="feed-main">
        <div className="meal">
          <div className="meal-head">
            <span className="meal-label">You feed it</span>
            {balance !== null && (
              <span className="meal-hold">
                {balance > BigInt(0) ? (
                  <>
                    <span>
                      You have{" "}
                      <b>
                        {fromRaw(balance, h.decimals)} {h.symbol}
                      </b>
                      {tribe ? `, worth ${usd(usdValue(balance, h.decimals, tribe.price_e18))}` : ""}
                    </span>
                    <button
                      className="small-button"
                      type="button"
                      onClick={() => {
                        setAmount(fromRaw(balance, h.decimals, h.decimals).replace(/,/g, ""));
                        setUsdText(null);
                        setError(null);
                      }}
                    >
                      Feed it all
                    </button>
                  </>
                ) : (
                  <span>You have no {h.symbol} yet</span>
                )}
              </span>
            )}
          </div>

          <div className="meal-figures">
            <label className="meal-usd">
              <span className="sr-only">Dollars of {h.symbol}</span>
              <span aria-hidden="true">$</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                placeholder="amount"
                disabled={!price}
                value={usdShown}
                onChange={(e) => {
                  const text = e.target.value.replace(/[^0-9.]/g, "");
                  const n = Number(text);
                  setUsdText(text);
                  setAmount(text && Number.isFinite(n) && n > 0 && price ? amountFor(n) : "");
                  setError(null);
                }}
                onBlur={() => setUsdText(null)}
              />
            </label>
            <label className="meal-token">
              <span className="sr-only">Amount of {h.symbol}</span>
              <span aria-hidden="true">is</span>
              <input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="how many"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setUsdText(null);
                  setError(null);
                }}
              />
              <Coin symbol={h.symbol} size={30} />
              <span className="meal-sym">{h.symbol}</span>
            </label>
          </div>

          <div className="meal-slider" style={{ ["--p" as string]: pos / SLIDER_STEPS }}>
            <div className="ms-run">
              <span className="ms-track" />
              <span className="ms-fill" />
              <input
                type="range"
                min={0}
                max={SLIDER_STEPS}
                step={1}
                value={pos}
                disabled={!canSlide}
                aria-label={`How much ${h.symbol} to feed, in dollars`}
                aria-valuetext={mealUsd > 0 ? usd(BigInt(Math.round(mealUsd * 1e6))) : "nothing yet"}
                onChange={(e) => setDollars(usdAt(Number(e.target.value)))}
              />
              <span className="ms-thumb">
                <Coin symbol={h.symbol} size={44} />
              </span>
              {marks.length > 0 && (
                <div className="ms-marks">
                  {marks.map((v) => (
                    <button
                      key={v}
                      type="button"
                      style={{ ["--t" as string]: posOf(v) / SLIDER_STEPS }}
                      aria-label={allHeld && v === topUsd ? `Feed all your ${h.symbol}` : `Feed ${v} ${v === 1 ? "dollar" : "dollars"} of ${h.symbol}`}
                      onClick={() => setDollars(v)}
                    >
                      {allHeld && v === topUsd && "all, "}${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Maw />
          </div>
        </div>

        <div className="yield" aria-live="polite">
          <Seal size={66} />
          <div>
            {quote ? (
              <>
                <span className="yield-label">You get a Bond for</span>
                <span className="yield-amount">
                  {fromRaw(quote.consume, CONSUME_DEC, 0)} <small>$CONSUME</small>
                </span>
                <span className="yield-sub">
                  Paid out a little each day for 30 days, {quote.bonus ? "with no tithe at a feast" : `after a ${usd(quote.tithe_usd)} tithe`}.
                </span>
              </>
            ) : (
              <>
                <span className="yield-title">You get a Bond</span>
                <span className="yield-sub">An NFT that pays you $CONSUME each day for 30 days. Feed more and it pays more.</span>
              </>
            )}
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
            <p className="hint">
              {balance !== null && balance === BigInt(0)
                ? `You have no ${h.symbol} to feed yet.`
                : heldUsd !== null && heldUsd <= minUsd
                  ? `You hold less than the smallest feeding, $${minUsd.toLocaleString("en-US")} of ${h.symbol}.`
                  : "Slide the memecoin toward the jaws, or type an amount."}
            </p>
          ) : (
            <p className="hint">A feeding cannot be taken back. Memecoins leave the Stomach only when $CONSUME is burned for them.</p>
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
        </div>
      </div>

      <details className="fine">
        <summary>Limits and storage</summary>
        <p>
          Anything over a memecoin’s feeding limit comes back to you. Each Bond takes a little NEAR for storage, paid from a refundable credit
          {credit.data !== undefined ? ` (yours: ${fromRaw(credit.data, 24, 3)} NEAR)` : ""}. Your first feeding adds 0.1 NEAR to it, and a little
          of that pays to register you for $CONSUME and to open the credit itself.{" "}
          {credit.data !== undefined && credit.data > BigInt(0) && (
            <button className="link-button" disabled={busy} onClick={withdrawCredit}>
              Take back unused credit
            </button>
          )}
        </p>
      </details>

      {scene && (
        <Feeding
          scene={scene}
          onClose={closeScene}
          onSeeBonds={() => {
            closeScene();
            document.getElementById("bonds")?.scrollIntoView({ behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bonds

async function loadAllVests(accountId: string): Promise<VestView[]> {
  const out: VestView[] = [];
  for (let from = 0; ; from += 50) {
    const page = await view<VestView[]>(CONSUME_CONTRACT, "get_vests_for_owner", { account_id: accountId, from_index: from, limit: 50 });
    out.push(...page);
    if (page.length < 50) break;
  }
  return out.sort((a, b) => Number(b.token_id) - Number(a.token_id));
}

type ClaimEvent = { vest_id: string; amount: string };
/** One transaction holds this many collections: each is given 25 Tgas, which leaves room for the account setup under the 300 Tgas a transaction may carry. */
const COLLECT_ALL_MOST = 10;
const COLLECT_ALL_TGAS = 25;
type ExitEvent = { vest_id: string; payout: string; forfeited: string };

const wholeConsume = (raw: bigint) => Number(raw / BigInt(10) ** BigInt(CONSUME_DEC));

/** ?preview=collect plays the collecting sheet with sample figures, and ?preview=collect-all the same for several Bonds at once; nothing is sent. */
function CollectPreview() {
  const [scene, setScene] = useState<CollectScene | null>(null);
  useEffect(() => {
    const which = new URLSearchParams(window.location.search).get("preview");
    if (which !== "collect" && which !== "collect-all") return;
    let alive = true;
    (async () => {
      // a sample build has no Bond 1 to draw, so it shows one of its sample Bonds
      const bond = DEMO ? DEMO_MINE[0] : "1";
      const base = { kind: "claim" as const, bond, card: `/bond/${bond}.svg`, bonds: which === "collect-all" ? 3 : undefined };
      await sleep(500);
      if (!alive) return;
      setScene({ ...base, stage: "waiting", amount: "4,812" });
      await sleep(2400);
      if (!alive) return;
      setScene((s) => (s ? { ...base, stage: "received", amount: "4,812", whole: 4812, rest: "44,469", by: "10 Dec", preview: true } : s));
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!scene) return null;
  return <Collecting scene={scene} onClose={() => setScene(null)} />;
}

/** "Your Bonds" only once there is a wallet whose Bonds they are. */
function BondsHeading() {
  const { accountId } = useWallet();
  return <h2 id="bonds-h">{DEMO || accountId ? "Your Bonds" : "Bonds"}</h2>;
}

/** Shown where your Bonds would be while no wallet is connected: the newest Bonds there are, as wallets show them. */
function BondShelf({ recent, minted, tick }: { recent: VestView[]; minted: string; tick: number }) {
  const { ready, connect } = useWallet();
  const note = (
    <p className="bond-show-yours">
      <button className="press" onClick={connect} disabled={!ready}>
        Connect wallet
      </button>
      <span>to see the Bonds you hold.</span>
    </p>
  );
  if (recent.length === 0) return note;
  const shown = recent.slice(0, 8);
  const count = Number(minted);
  return (
    <div className={shown.length <= 2 ? "bond-show few" : "bond-show"}>
      <ul className="bond-shelf" style={{ "--n": Math.min(shown.length, 4) } as CSSProperties}>
        {shown.map((v) => (
          <li key={v.token_id} className={v.vest.exited ? "broken" : undefined}>
            <a className="ind-card-link" href={`/bond/${v.token_id}.svg`} target="_blank" rel="noreferrer" title="Open the card full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="ind-card"
                src={`/bond/${v.token_id}.svg?v=${tick}`}
                width={CARD_W}
                height={CARD_H}
                alt={`Bond ${v.token_id}, the NFT card. Opens full size.`}
              />
            </a>
            <p>
              <span>
                <span className="no">№ {v.token_id}</span> held by
              </span>
              <span title={v.owner_id}>
                {/* the name breaks after a dot, not at a hyphen */}
                {shortAccount(v.owner_id, 32)
                  .split(/(?<=\.)/)
                  .map((part, i) => (
                    <span key={i} className="part">
                      {part}
                    </span>
                  ))}
              </span>
            </p>
          </li>
        ))}
      </ul>
      <div>
        <h3>{shown.length === 1 ? "The first Bond" : "The newest Bonds"}</h3>
        <p className="bond-show-what">
          {count > shown.length ? `${count} so far. ` : ""}
          Every feeding makes one. Whoever holds it can:
        </p>
        <ol className="bond-show-how">
          <li>
            <b>Collect</b> what has been released.
          </li>
          <li>
            <b>Send</b> it, and the uncollected payout goes with it.
          </li>
          <li>
            <b>Break the seal</b> to leave early and give up half of what is still locked.
          </li>
        </ol>
        {note}
      </div>
    </div>
  );
}

function Bonds({ snap, tick, onDone }: { snap: Snapshot; tick: number; onDone: Done }) {
  const { accountId, send } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBreak, setConfirmBreak] = useState<string | null>(null);

  // refreshed every 30 s and on focus, so "Collect" stays current as it vests
  const live = useLive(DEMO || !accountId ? null : `${accountId}:${tick}`, () => loadAllVests(accountId!), 30_000);
  const vests = DEMO ? DEMO_MINE.map((id) => snap.recent.find((v) => v.token_id === id)!) : live.data;

  // the sheet that shows the payout arriving; closing it never stops the transaction
  const [scene, setScene] = useState<CollectScene | null>(null);
  const watching = useRef(false);
  const closeScene = () => {
    watching.current = false;
    setScene(null);
  };

  // A Bond bought or received in a wallet that has never held $CONSUME: the account is
  // set up first. It goes to the same contract as the payout, so the two travel as one
  // transaction and the setup is not paid for if the payout is refused.
  const setup = async (): Promise<Call[]> => {
    if (await view<unknown>(CONSUME_CONTRACT, "storage_balance_of", { account_id: accountId })) return [];
    const bounds = await view<{ min: string }>(CONSUME_CONTRACT, "storage_balance_bounds");
    return [{ receiverId: CONSUME_CONTRACT, methodName: "storage_deposit", args: { registration_only: true }, deposit: bounds.min, gas: TGAS(10) }];
  };
  const endOf = (v: VestView) => Number((BigInt(v.vest.start_ns) + BigInt(v.vest.duration_ns)) / BigInt(1_000_000));

  /** Collect from every Bond with something ready, as one transaction. */
  const collectAll = async (ready: VestView[]) => {
    const batch = ready.slice(0, COLLECT_ALL_MOST);
    if (batch.length === 0) return;
    const expected = batch.reduce((a, v) => a + BigInt(v.claimable), BigInt(0));
    const locked = batch.reduce((a, v) => a + BigInt(v.locked), BigInt(0));
    const base = { kind: "claim" as const, bond: batch[0].token_id, bonds: batch.length, card: `/bond/${batch[0].token_id}.svg?v=${tick}` };
    setBusyId("all");
    setError(null);
    watching.current = true;
    setScene({ ...base, stage: "waiting", amount: fromRaw(expected, CONSUME_DEC, 0) });
    try {
      const calls = await setup();
      for (const v of batch)
        calls.push({ receiverId: CONSUME_CONTRACT, methodName: "claim", args: { token_id: v.token_id }, deposit: "0", gas: TGAS(COLLECT_ALL_TGAS) });
      const results = await send(calls);
      const r = results[0];
      if (r.failure) throw new Error(r.failure);
      // what the contract says it paid for each Bond, added up
      const paid = eventsData<ClaimEvent>(results, "claim").reduce((a, e) => a + BigInt(e.amount), BigInt(0));
      const got = paid > BigInt(0) ? paid : expected;
      const amount = fromRaw(got, CONSUME_DEC, 0);
      const last = new Date(Math.max(...batch.map(endOf)));
      if (watching.current)
        setScene({
          ...base,
          stage: "received",
          amount,
          whole: wholeConsume(got),
          rest: locked > BigInt(0) ? fromRaw(locked, CONSUME_DEC, 0) : undefined,
          by: last.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
          href: r.hash ? `${EXPLORER}/txns/${r.hash}` : undefined,
        });
      onDone(`Collected ${amount} $CONSUME from ${batch.length} Bonds.`, r.hash, watching.current);
    } catch (e) {
      if (watching.current) setScene({ ...base, stage: "refused", reason: cleanError(e) });
      else setError(cleanError(e));
    } finally {
      setBusyId(null);
    }
  };

  const act = async (v: VestView, method: "claim" | "exit") => {
    const id = v.token_id;
    const expected = BigInt(method === "exit" ? v.exit_payout : v.claimable);
    const locked = BigInt(v.locked);
    const giveUp = locked - (BigInt(v.exit_payout) - BigInt(v.claimable));
    const base = { kind: method, bond: id, card: `/bond/${id}.svg?v=${tick}` };
    setBusyId(id);
    setError(null);
    watching.current = true;
    setScene({
      ...base,
      stage: "waiting",
      amount: fromRaw(expected, CONSUME_DEC, 0),
      forfeit: method === "exit" ? fromRaw(giveUp, CONSUME_DEC, 0) : undefined,
    });
    try {
      const calls = await setup();
      calls.push({
        receiverId: CONSUME_CONTRACT,
        methodName: method,
        args: { token_id: id },
        deposit: method === "exit" ? ONE_YOCTO : "0",
        gas: TGAS(50),
      });
      const results = await send(calls);
      const r = results[0];
      if (r.failure) throw new Error(r.failure);
      // what the contract says it paid, which is a little more than the page showed a moment ago
      const left = method === "exit" ? eventData<ExitEvent>(results, "exit") : null;
      const got = BigInt((method === "exit" ? left?.payout : eventData<ClaimEvent>(results, "claim")?.amount) ?? expected.toString());
      const amount = fromRaw(got, CONSUME_DEC, 0);
      const ends = new Date(endOf(v));
      setConfirmBreak(null);
      if (watching.current)
        setScene({
          ...base,
          stage: "received",
          amount,
          whole: wholeConsume(got),
          rest: method === "claim" && locked > BigInt(0) ? fromRaw(locked, CONSUME_DEC, 0) : undefined,
          by: ends.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
          forfeited: left ? `${fromRaw(left.forfeited, CONSUME_DEC, 0)} $CONSUME` : undefined,
          href: r.hash ? `${EXPLORER}/txns/${r.hash}` : undefined,
        });
      onDone(method === "exit" ? `Seal broken. Received ${amount} $CONSUME.` : `Collected ${amount} $CONSUME.`, r.hash, watching.current);
    } catch (e) {
      if (watching.current) setScene({ ...base, stage: "refused", reason: cleanError(e) });
      else setError(cleanError(e));
    } finally {
      setBusyId(null);
    }
  };

  if (!DEMO && !accountId) return <BondShelf recent={snap.recent} minted={snap.stats.vests_minted} tick={tick} />;
  if (!DEMO && live.error)
    return (
      <p className="empty">
        Could not read your Bonds ({cleanError(live.error)}).{" "}
        <button className="link-button" onClick={live.reload}>
          Try again
        </button>
      </p>
    );
  if (!vests) return <p className="empty">Reading your Bonds…</p>;
  if (vests.length === 0) return <p className="empty">You hold no Bonds yet. Feed the Serpent to receive one.</p>;

  // what all of the holder's Bonds come to, and the ones one transaction could collect from now
  const open = vests.filter((v) => !v.vest.exited);
  const ready = open.filter((v) => BigInt(v.claimable) > BigInt(0));
  const sumOf = (list: VestView[], of: (v: VestView) => string) => list.reduce((a, v) => a + BigInt(of(v)), BigInt(0));
  const readyNow = sumOf(ready, (v) => v.claimable);
  const inOne = ready.slice(0, COLLECT_ALL_MOST);

  return (
    <>
      {error && <p className="demo-note">{error}</p>}
      {vests.length > 1 && (
        <div className="ind-all">
          <dl className="roll-sums ind-sums">
            <div>
              <dt>Ready to collect</dt>
              <dd suppressHydrationWarning>{fromRaw(readyNow, CONSUME_DEC, 0)}</dd>
            </div>
            <div>
              <dt>Still locked</dt>
              <dd suppressHydrationWarning>{fromRaw(sumOf(open, (v) => v.locked), CONSUME_DEC, 0)}</dd>
            </div>
            <div>
              <dt>Collected so far</dt>
              <dd suppressHydrationWarning>{fromRaw(sumOf(vests, (v) => v.vest.released), CONSUME_DEC, 0)}</dd>
            </div>
          </dl>
          <div className="ind-all-act">
            <button className="press" disabled={DEMO || inOne.length === 0 || busyId !== null} onClick={() => collectAll(ready)}>
              {ready.length > COLLECT_ALL_MOST ? `Collect from ${COLLECT_ALL_MOST} Bonds` : "Collect all"}
            </button>
            <p suppressHydrationWarning>
              {ready.length === 0
                ? "Nothing is ready yet. Each Bond releases a little more as time passes."
                : ready.length > COLLECT_ALL_MOST
                  ? `One transaction collects from ${COLLECT_ALL_MOST} Bonds at a time: ${fromRaw(sumOf(inOne, (v) => v.claimable), CONSUME_DEC, 0)} $CONSUME now, the rest with a second press.`
                  : `One transaction collects ${fromRaw(readyNow, CONSUME_DEC, 0)} $CONSUME from ${ready.length === 1 ? "the one Bond with something ready" : `${ready.length} Bonds`}.`}
            </p>
          </div>
        </div>
      )}
      <div className="ind-list">
        {vests.map((v) => {
          const h = heresyForToken(v.vest.tribe);
          const nowMs = DEMO ? DEMO_NOW_MS : undefined; // undefined: the real clock
          const frac = vestedFraction(v.vest.start_ns, v.vest.duration_ns, nowMs);
          const left = daysLeft(v.vest.start_ns, v.vest.duration_ns, nowMs);
          const claimable = BigInt(v.claimable);
          const locked = BigInt(v.locked);
          const forfeit = locked - (BigInt(v.exit_payout) - claimable);
          const ends = new Date(Number((BigInt(v.vest.start_ns) + BigInt(v.vest.duration_ns)) / BigInt(1_000_000)));
          return (
            <article key={v.token_id} className={v.vest.exited ? "ind broken" : "ind"}>
              {/* Live card from contract state; marketplace media support varies. */}
              <a className="ind-card-link" href={`/bond/${v.token_id}.svg`} target="_blank" rel="noreferrer" title="Open the card full size">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="ind-card"
                  src={`/bond/${v.token_id}.svg?v=${tick}`}
                  width={CARD_W}
                  height={CARD_H}
                  alt={`Bond ${v.token_id}, the NFT card. Opens full size.`}
                />
              </a>
              <div className="ind-body">
                <h3>
                  Bond <span className="no">№ {v.token_id}</span>
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
                      <span className="unit">
                        <ConsumeCoin size={22} /> $CONSUME
                      </span>
                    </p>
                    <p className="ind-progress" suppressHydrationWarning>
                      {Math.round(frac * 100)}% of {fromRaw(v.vest.total, CONSUME_DEC, 0)} released
                      {left > 0 ? `, the rest by ${ends.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}.
                    </p>
                    <div className="actions">
                      <button
                        className="press"
                        disabled={DEMO || claimable === BigInt(0) || busyId !== null}
                        onClick={() => act(v, "claim")}
                      >
                        Collect
                      </button>
                    </div>
                    <SendBond bond={v} disabled={busyId !== null} onBusy={(busy) => setBusyId(busy ? `send:${v.token_id}` : null)} onDone={onDone} />
                    {locked > BigInt(0) && (
                      <div className="ind-break">
                        {confirmBreak === v.token_id ? (
                          <button
                            className="small-button danger"
                            disabled={busyId !== null}
                            onClick={() => act(v, "exit")}
                          >
                            Yes, break it
                          </button>
                        ) : (
                          <button className="small-button" disabled={DEMO || busyId !== null} onClick={() => setConfirmBreak(v.token_id)}>
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
      {scene && <Collecting scene={scene} onClose={closeScene} />}
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

  const worth = (shares: [string, string][]) =>
    shares.reduce((a, [k, v]) => {
      const t = snap.tribes.find(([kk]) => kk === k)?.[1];
      return t ? a + usdValue(v, t.decimals, t.price_e18) : a;
    }, BigInt(0));
  const totalMicro = quote ? worth(quote.shares) : BigInt(0);

  const afterPayout = async (results: TxResult[], doneText: string) => {
    // null: the record could not be read, which is not the same as nothing owed
    const left = await view<[string, string][]>(CONSUME_CONTRACT, "get_owed", { account_id: accountId }).catch(() => null);
    const last = results[results.length - 1];
    onDone(
      left === null
        ? `${doneText} Could not check that every share was paid; if one was not, a Retry button shows here.`
        : left.length > 0
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
      const credit = BigInt(await view<string>(CONSUME_CONTRACT, "get_meal_credit", { account_id: accountId }));
      const storage: Call[] = credit < CREDIT_LOW
        ? [{ receiverId: CONSUME_CONTRACT, methodName: "add_meal_credit", args: {}, deposit: CREDIT_TOP_UP, gas: TGAS(10) }]
        : [];
      const results = await send([
        ...(await registrationCalls(tokens, accountId)),
        ...storage,
        { receiverId: CONSUME_CONTRACT, methodName: "redeem", args: { amount: raw.toString() }, deposit: ONE_YOCTO, gas: TGAS(290) },
      ]);
      // what the contract says it burned and gave, which can differ from the quote shown before signing
      const ev = eventData<RedeemEvent>(results, "redeem");
      if (!ev) throw new Error(results[results.length - 1].failure ?? "The redemption did not go through.");
      play("burn");
      setAmount("");
      await afterPayout(results, `Redeemed ${fromRaw(ev.burned ?? raw, CONSUME_DEC, 0)} $CONSUME for ${usd(worth(ev.shares ?? quote.shares))} of memecoins.`);
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
        // ten payouts at 20 Tgas each would use 200 Tgas on their own
        { receiverId: CONSUME_CONTRACT, methodName: "withdraw_owed", args: {}, gas: TGAS(300) },
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
              : "Collect $CONSUME from your Bonds first, then burn it here."}
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
        {owedLive.error && (
          <p className="hint">
            Could not check for unpaid shares.{" "}
            <button className="link-button" type="button" onClick={owedLive.reload}>
              Check again
            </button>
          </p>
        )}
        <p className="hint">
          Redeeming adds 0.1 NEAR of storage credit when yours is low. Unused credit can be taken back in the feeding panel.
        </p>
      </div>

      <div className="redeem-out" aria-live="polite">
        <span className="r-label">
          {typed ? "You receive" : balance && balance > BigInt(0) ? "All your $CONSUME takes" : `For example, ${fromRaw(EXAMPLE_REDEEM, CONSUME_DEC, 0)} $CONSUME takes`}
        </span>
        <span className="r-amount">{q.error ? "No figure" : usd(totalMicro)}</span>
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
          <p className="hint">{q.loading
              ? "Weighing the Stomach…"
              : q.error
                ? "The contract could not be read just now, so there is no figure to show. This is not an empty Stomach."
                : "The Stomach is empty, so there is nothing to take yet."}</p>
        )}
        <p className="hint r-foot">Your share counts all $CONSUME, locked in Bonds or not.</p>
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
          <th scope="col">Held by</th>
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
              <td>{shortAccount(v.owner_id, 32)}</td>
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

// How one Assayer account got its key. These are facts about that account, so they show only
// while the chain names it as the price feeder. It has no full-access key, so its keys cannot change.
const ASSAYER_KEY: Record<string, { made: string; named: string }> = {
  "assayer.consumecash.testnet": {
    made: "https://explorer.testnet.near.org/transactions/G1LAQEv9jzRMWFqL7BQzLHwv1bkm9JYF4uLBu9qEuZ31",
    named: "https://explorer.testnet.near.org/transactions/3EeeVAGK8UhTaynQKyBTjuZgzpzRWuLKUFqmxMVtH1qS",
  },
};

// The DAO that was handed the guardian role. Like the Assayer's key, these show only while the chain names it.
const GUARDIAN_DAO: Record<string, { handed: string; used: string }> = {
  "consume-guardian.sputnikv2.testnet": {
    handed: "https://explorer.testnet.near.org/transactions/3PdUM8nJXgu2L4eb8fDMLyXSGjkuNtJ3LHSUroZqhpnC",
    used: "https://explorer.testnet.near.org/transactions/n77wbaBQSXtMtzprBa8nYM2MnqFXJ6qXcmjTk6fsBU9",
  },
};

function Rule({ snap }: { snap: Snapshot }) {
  const c = snap.config;
  const days = Number(BigInt(c.vest_duration_ns) / BigInt(86_400_000_000_000));
  const haircut = c.exit_haircut_bps / 100;
  // read from the chain, so the page cannot go on saying the key is gone, or still there, when it is not
  const keys = useLive(DEMO ? null : "contract-keys", () => fullAccessKeys(CONSUME_CONTRACT), 300_000).data;
  // who holds the two roles, as the contract answers; the sample figures name nobody
  const feeder = c.price_feeder_id;
  const guardian = c.guardian_id;
  const limited = feeder ? ASSAYER_KEY[feeder] : undefined;
  const dao = guardian ? GUARDIAN_DAO[guardian] : undefined;
  // who votes in the DAO, read from the DAO itself: the page must not go on saying one account when there are more
  const council = useLive(dao && guardian ? `council-${guardian}` : null, () => daoCouncil(guardian!), 300_000).data;
  return (
    <>
      <div className="charter">
        <ol className="articles">
          <li>
            <span className="article-top">
              <b>I</b>
              <FeedEmblem />
            </span>
            <h3>Feed</h3>
            <p>
              $CONSUME is earned at its backing, so what you feed is what you could redeem, less a tithe of{" "}
              <em>
                {c.tithe_step_bps / 100}% to {c.max_tithe_bps / 100}%
              </em>
              .
            </p>
          </li>
          <li>
            <span className="article-top">
              <b>II</b>
              <HourglassEmblem />
            </span>
            <h3>Release</h3>
            <p>
              Paid out over <em>{days} days</em>. Break the seal early and lose <em>{haircut}%</em> of what is still locked.
            </p>
          </li>
          <li>
            <span className="article-top">
              <b>III</b>
              <ScalesEmblem />
            </span>
            <h3>Redeem</h3>
            <p>
              Burn $CONSUME for <em>your share</em> of the Stomach, paid in memecoins. Nothing else takes them out.
            </p>
          </li>
        </ol>

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
              Every feeding earns $CONSUME at the current backing, so a late feeder gets the same deal as an early one: what you feed is what
              you could redeem, less the tithe. The first feeding sets it at {c.start_rate} per dollar. The tithe is the part of a feeding that
              earns no $CONSUME and so belongs to everyone already holding: {c.tithe_step_bps / 100}% at the start, {c.tithe_step_bps / 100}% more
              with each famine (every {usd(c.famine_usd, 0)} eaten), never above {c.max_tithe_bps / 100}%. A feeding can never lower the backing.
            </p>
          </div>
          <div>
            <h3>Bonds</h3>
            <p>
              Your $CONSUME arrives in an NFT that releases it evenly over {days} days. Send the Bond and the rest goes with it. Break the
              seal early and you take what has been released plus half the rest; the other {haircut}% is never minted, which raises everyone
              else&apos;s share.
            </p>
          </div>
          <div>
            <h3>The Stomach</h3>
            <p>
              Fed memecoins never leave except through redemption. Burning $CONSUME pays your share of every memecoin inside, measured against all $CONSUME
              including what is still locked in Bonds.
            </p>
          </div>
          <div>
            <h3>Feasts and limits</h3>
            <p>
              The memecoin fed most in a week pays no tithe the next week. None feasts two weeks running: if the one feasting is fed the most
              again, the Feast passes to the most fed of the others. Each memecoin has a largest feeding and a daily limit; thin
              markets get small ones, so little of an overpriced memecoin can be fed in a day.
            </p>
          </div>
          <div>
            <h3>The Assayer</h3>
            <p>
              Prices come from one price-feeder account, the Assayer, which reads NEAR Intents quotes. Feedings are refused when any price they
              depend on is more than 15 minutes old. It cannot move what is in the Stomach, but its prices decide what a feeding earns. The limits cap a price that is too high on the
              memecoin fed. They do not cap a price that is too low on what the Stomach holds: a feeding made then earns more than its share.
            </p>
          </div>
          <div>
            <h3>Who you trust</h3>
            <p>
              The ten memecoins, their limits, the tithe and its famines, the feast and the 30 days were set when the contract launched, and it has
              no way to change them. One role is left, the guardian, with two powers: seal or unseal a memecoin on the list, and replace the
              Assayer. It cannot mint or withdraw, and it can give the role up for good. A bad guardian could still appoint a dishonest Assayer.{" "}
              {keys === 0
                ? "The contract account holds no key (read from the chain just now), so its code cannot be replaced."
                : keys
                  ? "The contract account still holds a key (read from the chain just now), so whoever has it could replace the code. It is to be deleted after a full run on testnet."
                  : "The contract account's keys are to be deleted once it is set up."}
            </p>
          </div>
          </div>
        </details>

        <div className="charter-fold">
          <h3>Who you trust</h3>
          <p>
            {keys
              ? "Three parties, each with its seal on this, and for now a fourth: whoever holds the contract account's key."
              : "Three parties. Everything else was fixed at launch."}
          </p>
        </div>
      </div>

      <ul className="seals">
        <li>
          <span className="seal-hang">
            <PartySeal party="assayer" />
          </span>
          <div>
            <h4>The Assayer</h4>
            <p>
              Sets the prices, from NEAR Intents quotes. A dishonest Assayer could mint itself most of the Stomach.
            </p>
            <p className="seal-note">The biggest trust here</p>
            {feeder && (
              <p className="seal-who">
                Today it is <b>{feeder}</b>.
                {limited && (
                  <>
                    {" "}
                    Its one key can only post prices: see <a href={limited.made}>the account made with that key</a> and{" "}
                    <a href={limited.named}>the guardian naming it</a>.
                  </>
                )}
              </p>
            )}
          </div>
        </li>
        <li>
          <span className="seal-hang">
            <PartySeal party="guardian" />
          </span>
          <div>
            <h4>The guardian</h4>
            <p>
              Can seal a memecoin and swap the Assayer. Nothing else, and nobody can withdraw.
            </p>
            {guardian === null && <p className="seal-who">Nobody holds it now: the role was given up, so the Assayer can never be swapped.</p>}
            {guardian && dao && (
              <p className="seal-who">
                Today it is <b>{guardian}</b>, a DAO: see <a href={dao.handed}>the handover</a> and{" "}
                <a href={dao.used}>the DAO using the role</a>.
                {council?.length === 1 && (
                  <>
                    {" "}
                    Its council is one account, <b>{council[0]}</b>, so one builder still decides.
                  </>
                )}
                {council && council.length > 1 && <> Its council has {council.length} accounts: {council.join(", ")}.</>}
              </p>
            )}
            {guardian && !dao && (
              <p className="seal-who">
                Today it is <b>{guardian}</b>
                {guardian === feeder
                  ? ", the same account as the Assayer."
                  : feeder?.endsWith(`.${guardian}`)
                    ? ". It made the Assayer's account, so one builder holds both keys."
                    : "."}
              </p>
            )}
          </div>
        </li>
        <li>
          <span className="seal-hang">
            <PartySeal party="intents" />
          </span>
          <div>
            <h4>NEAR Intents</h4>
            <p>
              Holds the memecoins that arrive through it, in the Stomach&apos;s own balance.
            </p>
          </div>
        </li>
      </ul>
      <RoundFold tribes={snap.tribes} />
    </>
  );
}
