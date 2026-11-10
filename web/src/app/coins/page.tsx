// Review sheet: all ten coins at large size, and the Bond card each one gets.
// Not linked from the site.
import { BondCard, BondSquare, type CardData } from "@/components/BondCard";
import { Coin } from "@/components/Coin";
import { HERESIES } from "@/lib/heresies";

export const metadata = { title: "Coins", robots: { index: false } };

const sample = (symbol: string, chain: string, i: number): CardData => ({
  id: String(i + 1),
  symbol,
  chain,
  eaten: ["1,500", "81,871,345", "12.4M", "2,240", "310"][i % 5],
  mealUsd: ["$103.48", "$420.00", "$50.00", "$1,000.00", "$12.00"][i % 5],
  consume: ["97,777", "420,000", "47,244", "1,000,000", "11,300"][i % 5],
  from: "9 Nov 2026",
  to: "9 Dec 2026",
  released: [0.1, 0.4, 0, 1, 0.6][i % 5],
  days: 30,
  exited: i === 7,
  bonus: i === 2,
});

export default function Coins() {
  return (
    <main style={{ padding: 32 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 220px)", gap: 24, justifyContent: "center" }}>
        {HERESIES.map((h) => (
          <figure key={h.symbol} style={{ margin: 0, textAlign: "center" }}>
            <Coin symbol={h.symbol} chain={h.chain} size={220} />
            <figcaption style={{ fontFamily: "var(--font-sc)" }}>{h.symbol}</figcaption>
          </figure>
        ))}
      </div>
      <div id="cards" className="proof-cards" style={{ display: "grid", gridTemplateColumns: "repeat(5, 280px)", gap: 24, justifyContent: "center", marginTop: 48 }}>
        {HERESIES.map((h, i) => (
          <div key={h.symbol}>
            <BondCard d={sample(h.symbol, h.chain, i)} />
          </div>
        ))}
      </div>
      <div id="squares" className="proof-cards" style={{ display: "grid", gridTemplateColumns: "repeat(5, 280px)", gap: 24, justifyContent: "center", marginTop: 48 }}>
        {HERESIES.slice(0, 5).map((h, i) => (
          <div key={h.symbol}>
            <BondSquare d={sample(h.symbol, h.chain, i)} />
          </div>
        ))}
      </div>
      <style>{".proof-cards svg{width:100%;height:auto;display:block}"}</style>
    </main>
  );
}
