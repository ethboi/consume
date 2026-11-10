"use client";

// The feeding, shown as it happens: the memecoin waits at the serpent's jaws
// while the wallet and the chain do their part, is swallowed when the feeding
// lands, and the Bond it earned is laid on the table.

import { useEffect, useRef } from "react";
import { BondCard, type CardData } from "./BondCard";
import { Coin } from "./Coin";
import { Ouroboros } from "./Ouroboros";
import { play } from "@/lib/sound";

/** What is being fed, already formatted for reading. */
export type Meal = { symbol: string; chain: string; amount: string; worth: string };

export type FeedingScene =
  | { stage: "waiting" | "swallowing"; meal: Meal }
  | { stage: "bond"; meal: Meal; card: CardData; href?: string; preview?: boolean }
  | { stage: "refused"; meal: Meal; reason: string };

/** How long the swallow plays before the Bond is shown. */
export const SWALLOW_MS = 1900;

const HEADING: Record<FeedingScene["stage"], string> = {
  waiting: "The Serpent waits",
  swallowing: "Swallowed",
  bond: "Your Bond",
  refused: "It refused the feeding",
};

export function Feeding({ scene, onClose, onSeeBonds }: { scene: FeedingScene; onClose: () => void; onSeeBonds: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      d.focus(); // the sheet itself, so no single button is ringed before the feeder has chosen one
    }
  }, []);

  // heard as well as seen, for a visitor who has switched sound on
  const stage = scene.stage;
  useEffect(() => {
    if (stage === "swallowing") play("swallow");
    else if (stage === "bond") play("bond");
    else if (stage === "refused") play("refuse");
  }, [stage]);

  const { meal } = scene;
  return (
    <dialog
      ref={ref}
      className="feeding"
      tabIndex={-1}
      data-stage={scene.stage}
      aria-labelledby="feeding-h"
      onClose={onClose}
      onClick={(e) => {
        // a click on the dark around the sheet closes it
        if (e.target === ref.current) onClose();
      }}
    >
      <button className="feeding-close" type="button" aria-label="Close" onClick={onClose}>
        ×
      </button>

      {scene.stage === "bond" ? (
        <div className="feeding-bond">
          <div className="feeding-card">
            <BondCard d={scene.card} />
          </div>
          <div className="feeding-words">
            <h2 id="feeding-h">
              Bond <span className="no">№ {scene.card.id}</span> is yours
            </h2>
            <p>
              It pays you <strong>{scene.card.consume} $CONSUME</strong> over {Math.round(scene.card.days)} days, a little each day. Collect
              whenever you like.
            </p>
            <p className="hint">
              The {meal.amount} {meal.symbol} you fed is in the Stomach now, and a feeding cannot be taken back. The card is an NFT: sell it
              and the payout goes with it.
            </p>
            <div className="actions">
              <button className="press big" type="button" onClick={onSeeBonds}>
                See your Bonds
              </button>
              <button className="press quiet" type="button" onClick={onClose}>
                Feed again
              </button>
            </div>
            {scene.href && (
              <p className="feeding-foot">
                <a href={scene.href} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              </p>
            )}
            {scene.preview && <p className="feeding-foot">A preview with sample figures. Nothing was sent.</p>}
          </div>
        </div>
      ) : (
        <div className="feeding-scene" aria-live="polite">
          <div className="feeding-ring" aria-hidden="true">
            <Ouroboros title="" />
            <p className="feeding-worth">
              <b>{meal.worth}</b>
              <span>of {meal.symbol}</span>
            </p>
            <span className="feeding-coin">
              <Coin symbol={meal.symbol} chain={meal.chain} size={72} />
            </span>
          </div>
          <h2 id="feeding-h">{HEADING[scene.stage]}</h2>
          {scene.stage === "waiting" && (
            <p>
              Approve the feeding in your wallet. Then {meal.amount} {meal.symbol} goes into the Stomach.
            </p>
          )}
          {scene.stage === "swallowing" && (
            <p>
              {meal.amount} {meal.symbol} is in the Stomach. Your Bond is being sealed.
            </p>
          )}
          {scene.stage === "refused" && (
            <>
              <p className="error">{scene.reason}</p>
              <div className="actions">
                <button className="press" type="button" onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
