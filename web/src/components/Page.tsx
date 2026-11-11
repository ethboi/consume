// The head and foot of the pages beside the home page. The head's mark goes
// home and its links name the pages; the foot is the same one the home page has.

import Link from "next/link";
import { NETWORK } from "@/lib/near";
import { Ouroboros } from "./Ouroboros";

export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL?.trim() || "https://github.com/ethboi/consume";

const PAGES = [
  ["/how-it-works", "How it works"],
  ["/simulation", "The Simulation"],
  ["/demo", "Demo guide"],
] as const;

export function PageHead({ here }: { here: (typeof PAGES)[number][0] }) {
  return (
    <header className="masthead page-head">
      <Link className="masthead-mark" href="/" aria-label="CONSUME, home">
        <Ouroboros size={40} solid title="" />
        <span>
          <b>C</b>onsume
        </span>
      </Link>
      <nav aria-label="Pages">
        {PAGES.map(([href, name]) => (
          <Link key={href} href={href} aria-current={href === here ? "page" : undefined}>
            {name}
          </Link>
        ))}
      </nav>
      <Link className="sign-button" href="/#feed">
        Feed<span className="sign-long"> the Serpent</span>
      </Link>
    </header>
  );
}

export function Colophon() {
  return (
    <footer className="colophon invert">
      <span>
        Built at NEAR HACKATHON by{" "}
        <a href="https://x.com/EthBoi_" target="_blank" rel="noreferrer">
          @EthBoi_
        </a>
        . Running on NEAR {NETWORK === "mainnet" ? "mainnet" : "testnet"}.
      </span>
      <nav aria-label="More">
        <Link href="/how-it-works">How it works</Link>
        <Link href="/simulation">The Simulation</Link>
        <Link href="/demo">Demo guide</Link>
        {REPO_URL && <a href={REPO_URL}>GitHub</a>}
        <a href="/llms.txt">For agents</a>
        <a href="https://oneup.markets" title="OneUp, another project by the same builder">
          Also by @EthBoi_: OneUp
        </a>
      </nav>
    </footer>
  );
}
