"use client";

// "Take the tour": six stops down the page, one line each, on a small card
// pinned to the foot of the window. It only scrolls and explains: nothing is
// read from a wallet, signed or sent.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TOUR, TOUR_NUMERALS } from "@/lib/tour";

function show(id: string) {
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
}

export function Tour() {
  const [at, setAt] = useState<number | null>(null);
  const start = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const onward = useRef<HTMLButtonElement>(null);
  const open = at !== null;

  const go = useCallback((i: number) => {
    const to = Math.max(0, Math.min(TOUR.length - 1, i));
    setAt(to);
    show(TOUR[to].id);
  }, []);
  const end = useCallback(() => {
    setAt(null);
    start.current?.focus({ preventScroll: true });
  }, []);
  // the last stop hands over to the first action on the page
  const feed = useCallback(() => {
    setAt(null);
    show("feed");
    const section = document.getElementById("feed");
    if (section) {
      section.tabIndex = -1;
      section.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    onward.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (at === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
      // the arrows step only while the card has the keyboard, so an amount field keeps its own
      else if (card.current?.contains(document.activeElement)) {
        if (e.key === "ArrowRight") go(at + 1);
        if (e.key === "ArrowLeft") go(at - 1);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [at, end, go]);

  const stop = at === null ? null : TOUR[at];
  const last = at === TOUR.length - 1;
  return (
    <>
      <button ref={start} type="button" className="press big second tour-start" aria-expanded={open} onClick={() => (open ? end() : go(0))}>
        <span aria-hidden="true">☞</span> Take the tour
      </button>
      {stop &&
        at !== null &&
        createPortal(
          <div ref={card} className="tour-card" role="dialog" aria-label="A tour of the page">
            <p className="tour-at">
              <b>{TOUR_NUMERALS[at]}</b> of {TOUR_NUMERALS[TOUR.length - 1]}
            </p>
            <button type="button" className="tour-end" onClick={end}>
              End the tour
            </button>
            <div className="tour-stop" aria-live="polite">
              <h3>{stop.name}</h3>
              <p>{stop.line}</p>
            </div>
            <div className="tour-steps">
              <button type="button" className="press quiet" disabled={at === 0} onClick={() => go(at - 1)}>
                Back
              </button>
              <button ref={onward} type="button" className="press" onClick={last ? feed : () => go(at + 1)}>
                {last ? "Feed the Serpent" : "Next"}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
