// Review sheet: all ten coins at large size. Not linked from the site.
import { Coin } from "@/components/Coin";
import { HERESIES } from "@/lib/heresies";

export const metadata = { title: "Coins", robots: { index: false } };

export default function Coins() {
  return (
    <main style={{ display: "grid", gridTemplateColumns: "repeat(5, 220px)", gap: 24, padding: 32, justifyContent: "center" }}>
      {HERESIES.map((h) => (
        <figure key={h.symbol} style={{ margin: 0, textAlign: "center" }}>
          <Coin symbol={h.symbol} chain={h.chain} size={220} />
          <figcaption style={{ fontFamily: "var(--font-sc)" }}>{h.symbol}</figcaption>
        </figure>
      ))}
    </main>
  );
}
