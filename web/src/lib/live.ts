"use client";

// A small hook for reading chain state that (1) only shows data for the inputs
// it was asked for, so a slow old response can never overwrite a newer one,
// (2) can refresh on a timer, and (3) keeps loading, error and data apart.

import { useEffect, useState } from "react";

type Entry<T> = { key: string; data?: T; error?: string };

export function useLive<T>(key: string | null, load: () => Promise<T>, refreshMs?: number) {
  const [entry, setEntry] = useState<Entry<T> | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    // the timer and a refocus can ask twice at once: only the latest answer is kept
    let asked = 0;
    const run = () => {
      const mine = ++asked;
      const current = () => alive && mine === asked;
      load()
        .then((data) => current() && setEntry({ key, data }))
        .catch((e: unknown) => current() && setEntry({ key, error: e instanceof Error ? e.message : String(e) }));
    };
    run();
    const id = refreshMs ? setInterval(run, refreshMs) : undefined;
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      if (id) clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
    // `load` is recreated each render; `key` captures everything it depends on
  }, [key, nonce, refreshMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = key !== null && entry?.key === key ? entry : null;
  return {
    data: current?.data,
    error: current?.error,
    loading: key !== null && !current,
    reload: () => setNonce((n) => n + 1),
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
