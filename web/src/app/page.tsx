import { Consume } from "@/components/Consume";
import { DEMO, loadSnapshot, type Snapshot } from "@/lib/near";
import { DEMO_SNAPSHOT } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function Page() {
  let snapshot: Snapshot = DEMO_SNAPSHOT;
  let loadError: string | null = null;
  if (!DEMO) {
    try {
      snapshot = await loadSnapshot();
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }
  return <Consume initial={snapshot} loadError={loadError} />;
}
