// What every browser test does to its page: keep it on this machine, and keep
// a list of everything that went wrong on it.

import type { Page } from "@playwright/test";
import { HERESIES } from "../src/lib/heresies";

/**
 * Keeps the page on this machine. The wallet connector's list of public
 * wallets is answered with an empty one; any other request to the outside is
 * refused and its address returned in the list, so a test can say what the
 * page tried to reach.
 */
export async function stayLocal(page: Page): Promise<string[]> {
  const refused: string[] = [];
  await page.route(
    (url) => !["127.0.0.1", "localhost"].includes(url.hostname),
    async (route) => {
      const url = route.request().url();
      if (/\/repository\/manifest\.json$/.test(new URL(url).pathname)) {
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ wallets: [], version: "1.0.0" }) });
      }
      refused.push(url);
      return route.abort();
    },
  );
  return refused;
}

export type Seen = {
  /** Errors thrown by the page's own scripts. */
  pageErrors: string[];
  /** Everything the page wrote to the console as an error. */
  consoleErrors: string[];
  /** Every answer of 400 or worse to something the page asked for. */
  failed: string[];
  /** Every address outside this machine the page reached for. */
  refused: string[];
};

/** Keeps the page on this machine and writes down what goes wrong on it. */
export async function watch(page: Page): Promise<Seen> {
  const seen: Seen = { pageErrors: [], consoleErrors: [], failed: [], refused: await stayLocal(page) };
  page.on("pageerror", (e) => seen.pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") seen.consoleErrors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) seen.failed.push(`${r.status()} ${r.url()}`);
  });
  return seen;
}

/**
 * What the page is told about the roads through NEAR Intents: every one open,
 * but for the memecoins named. The site's own answer (/api/routes) asks the
 * public 1Click API, so the tests give the answer themselves and need no
 * outside service.
 */
export async function roads(page: Page, shut: string[] = []) {
  await page.route("**/api/routes", (route) =>
    route.fulfill({
      json: {
        checkedAt: Date.now(),
        routes: HERESIES.map((h) => (shut.includes(h.symbol) ? { symbol: h.symbol, chain: h.chain, open: false, outUsd: null, seconds: null } : { symbol: h.symbol, chain: h.chain, open: true, outUsd: 99.4, seconds: 30 })),
      },
    }),
  );
}
