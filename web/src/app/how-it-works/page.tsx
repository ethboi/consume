import type { Metadata } from "next";
import { HowItWorks } from "@/components/HowItWorks";
import { DEMO, loadSnapshot, type Snapshot } from "@/lib/near";
import { DEMO_SNAPSHOT } from "@/lib/demo";

export const metadata: Metadata = {
  title: "How it works",
  description: "The rules the CONSUME contract holds, the three parties it trusts, and how memecoins reach it from other chains through NEAR Intents.",
};
export const dynamic = "force-dynamic";

export default async function HowItWorksPage() {
  let snapshot: Snapshot = DEMO_SNAPSHOT;
  let loadError: string | null = null;
  if (!DEMO) {
    try {
      snapshot = await loadSnapshot();
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }
  return <HowItWorks initial={snapshot} loadError={loadError} />;
}
