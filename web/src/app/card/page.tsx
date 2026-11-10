// The share card (the picture X and chat apps show for a link to the site),
// drawn with the site's own serpent at exactly 1200 x 630. It is not linked
// from anywhere: scripts/share-card.sh photographs this page and saves the
// result as src/app/opengraph-image.png and twitter-image.png.

import type { Metadata } from "next";
import { Coin } from "@/components/Coin";
import { Ouroboros } from "@/components/Ouroboros";
import { Glory } from "@/components/Woodblock";
import { HERESIES as THE_TEN } from "@/lib/heresies";
import "./card.css";

export const metadata: Metadata = { title: "Share card", robots: { index: false } };

const ORBIT = Array.from({ length: 10 }, (_, i) => (270 + i * 36) % 360);

export default function ShareCard() {
  return (
    <main className="share-card">
      <div className="hero-art">
        <div className="hero-sigil">
          <Glory />
          <Ouroboros title="" />
          {THE_TEN.map((h, i) => (
            <span
              key={h.symbol}
              className="float-coin"
              style={{
                ["--a" as string]: `${ORBIT[i]}deg`,
                ["--tilt" as string]: `${(i % 2 ? 1 : -1) * (6 + (i % 4) * 4)}deg`,
              }}
            >
              <Coin symbol={h.symbol} chain={h.chain} size={64} />
            </span>
          ))}
          <p className="wordmark">
            <b>C</b>onsume
          </p>
        </div>
      </div>
      <div className="share-copy">
        <h1>The memecoin that eats memecoins.</h1>
        <p>Feed it yours, earn $CONSUME, and burn it any time for your share of the Stomach.</p>
        <p className="share-where">
          <span>consume.cash</span>
          <span>NEAR Hackathon</span>
        </p>
      </div>
    </main>
  );
}
