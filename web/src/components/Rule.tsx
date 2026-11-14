"use client";

// The Rule: the three things the contract does, every rule behind a fold, and
// the three parties it trusts, each with who holds the role today as the chain
// answers. It is the first half of the "How it works" page.

import { CONSUME_CONTRACT, DEMO, daoCouncil, fullAccessKeys, type Snapshot } from "@/lib/near";
import { usd } from "@/lib/format";
import { useLive } from "@/lib/live";
import { FeedEmblem, HourglassEmblem, ScalesEmblem } from "./Emblems";
import { PartySeal } from "./Seal";
import { RoundFold } from "./Round";

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

export function Rule({ snap }: { snap: Snapshot }) {
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
                    Its one key only posts prices (<a href={limited.made}>made</a>, <a href={limited.named}>named</a>).
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
                Today it is <b>{guardian}</b>, a DAO (<a href={dao.handed}>handover</a>, <a href={dao.used}>in use</a>).
                {council?.length === 1 && (
                  <>
                    {" "}
                    Its one council member, <b>{council[0]}</b>, still decides.
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
