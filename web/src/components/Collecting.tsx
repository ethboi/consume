"use client";

// Collecting, shown as it happens: the Bond waits while the wallet and the
// chain do their part, then $CONSUME coins spill out of it into a heap beside it and the
// sum counts up to what was received. Breaking the seal pays out the same way.

import { useEffect, useRef, useState } from "react";
import { CARD_H, CARD_W } from "./BondCard";
import { ConsumeCoin } from "./Coin";
import { coins, play } from "@/lib/sound";

type Base = { kind: "claim" | "exit"; bond: string; card: string };

export type CollectScene =
  | (Base & { stage: "waiting"; amount: string; forfeit?: string })
  | (Base & {
      stage: "received";
      /** what arrived, ready to read */
      amount: string;
      /** the same in whole $CONSUME, for the count */
      whole: number;
      /** claim: what the Bond still holds, and the day the last of it is released */
      rest?: string;
      by?: string;
      /** exit: what was given up */
      forfeited?: string;
      href?: string;
      preview?: boolean;
    })
  | (Base & { stage: "refused"; reason: string });

// Where each coin comes to rest: three rows, the bottom one laid first.
// x and y are in coin widths from the middle of the floor, r is its lean.
const HEAP: { x: number; y: number; r: number }[] = [
  { x: -1.72, y: 0, r: -14 },
  { x: 1.7, y: 0, r: 22 },
  { x: -0.86, y: 0, r: 9 },
  { x: 0.84, y: 0, r: -19 },
  { x: 0, y: 0, r: 4 },
  { x: -1.3, y: 0.66, r: 17 },
  { x: 1.28, y: 0.66, r: -8 },
  { x: -0.42, y: 0.68, r: -24 },
  { x: 0.44, y: 0.68, r: 12 },
  { x: -0.86, y: 1.32, r: 6 },
  { x: 0.84, y: 1.33, r: -15 },
  { x: 0, y: 1.36, r: 20 },
];
const DROP_GAP_MS = 115;
/** How far into its 0.7 s fall a coin meets the heap. */
const COIN_LANDS_MS = 480;
/** When the last coin has landed and the sum has stopped. */
const SETTLED_MS = HEAP.length * DROP_GAP_MS + 700;

/** Counts from nothing up to `target` while the coins fall. */
function useCount(target: number | null) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (target === null) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const p = still ? 1 : Math.min(1, (now - t0) / SETTLED_MS);
      setShown(Math.round(target * (1 - (1 - p) ** 2)));
      if (p < 1) raf = requestAnimationFrame(step);
    });
    // frames stop in a hidden tab (the wallet may be in front), so the sum is also set outright
    const end = setTimeout(() => setShown(target), SETTLED_MS + 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(end);
    };
  }, [target]);
  return target === null ? null : shown;
}

export function Collecting({ scene, onClose }: { scene: CollectScene; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      d.focus();
    }
  }, []);

  // each coin is heard as it lands, for a visitor who has switched sound on
  const { stage, kind } = scene;
  useEffect(() => {
    if (stage === "refused") play("refuse");
    if (stage !== "received") return;
    if (kind === "exit") play("crack");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) coins(3, 0.12, 0.2);
    else coins(HEAP.length, DROP_GAP_MS / 1000, COIN_LANDS_MS / 1000);
  }, [stage, kind]);

  const received = scene.stage === "received" ? scene : null;
  const count = useCount(received ? received.whole : null);
  const counting = received !== null && count !== null && count < received.whole;
  const exit = scene.kind === "exit";

  return (
    <dialog
      ref={ref}
      className="feeding collecting"
      tabIndex={-1}
      data-stage={scene.stage}
      aria-labelledby="collecting-h"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <button className="feeding-close" type="button" aria-label="Close" onClick={onClose}>
        ×
      </button>

      <div className="feeding-scene">
        <div className="collect-stage" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="collect-card" src={scene.card} width={CARD_W} height={CARD_H} alt="" />
          <div className="collect-heap">
            {HEAP.map((c, i) => (
              <span key={i} style={{ "--x": c.x, "--y": c.y, "--r": `${c.r}deg`, "--d": `${i * DROP_GAP_MS}ms` } as React.CSSProperties}>
                <ConsumeCoin size={46} />
              </span>
            ))}
          </div>
        </div>

        {scene.stage === "waiting" && (
          <div aria-live="polite">
            <h2 id="collecting-h">{exit ? "Breaking the seal" : "Collecting"}</h2>
            <p>
              Approve it in your wallet.{" "}
              {exit
                ? `You take ${scene.amount} $CONSUME now${scene.forfeit ? ` and give up ${scene.forfeit}` : ""}.`
                : `Bond № ${scene.bond} pays you ${scene.amount} $CONSUME.`}
            </p>
          </div>
        )}

        {received && (
          <>
            <h2 id="collecting-h">{exit ? "Seal broken" : "Collected"}</h2>
            <p className="collect-sum">
              {/* the count is for the eye; a screen reader gets the sum once */}
              <b aria-hidden="true">{counting ? count.toLocaleString("en-US") : received.amount}</b>
              <span className="sr-only">{received.amount}</span>
              <span className="collect-unit">
                <ConsumeCoin size={26} /> $CONSUME
              </span>
            </p>
            <div className="collect-after">
              <p>
                It is in your wallet.{" "}
                {exit
                  ? received.forfeited
                    ? `You gave up ${received.forfeited} that was still locked. It will never be minted.`
                    : ""
                  : received.rest
                    ? `Bond № ${scene.bond} holds about ${received.rest} more${received.by ? `, the last of it released on ${received.by}` : ""}.`
                    : `Bond № ${scene.bond} has paid out in full.`}
              </p>
              <div className="actions">
                <button className="press big" type="button" onClick={onClose}>
                  Done
                </button>
              </div>
              {received.href && (
                <p className="feeding-foot">
                  <a href={received.href} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                </p>
              )}
              {received.preview && <p className="feeding-foot">A preview with sample figures. Nothing was sent.</p>}
            </div>
          </>
        )}

        {scene.stage === "refused" && (
          <div aria-live="polite">
            <h2 id="collecting-h">{exit ? "The seal held" : "Nothing was collected"}</h2>
            <p className="error">{scene.reason}</p>
            <div className="actions">
              <button className="press" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
