// GET /bond/<id>.svg : the Bond as its tall tarot card, the way the site shows it.

import { bondSvg } from "@/lib/bond-svg";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return bondSvg((await ctx.params).id, false);
}
