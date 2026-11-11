import type { Metadata } from "next";
import { AbacusEmblem } from "@/components/Emblems";
import { Colophon, PageHead, REPO_URL } from "@/components/Page";
import { Simulation } from "@/components/Simulation";

export const metadata: Metadata = {
  title: "The Simulation",
  description: "Sixty days of feeding, collecting and redeeming, run four ways through the CONSUME contract's own arithmetic. Every figure is simulated.",
};

export default function SimulationPage() {
  return (
    <div className="folio">
      <PageHead here="/simulation" />
      <h1 className="sr-only">CONSUME: sixty days, simulated</h1>
      <section className="chapter" id="sim" aria-labelledby="sim-h">
        <header>
          <AbacusEmblem />
          <h2 id="sim-h">The Simulation</h2>
          <p>Sixty days run four ways through the contract&apos;s own arithmetic. Every figure here is simulated.</p>
        </header>
        <Simulation repoUrl={REPO_URL} />
      </section>
      <Colophon />
    </div>
  );
}
