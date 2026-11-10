// GET /bond/square/<id>.svg : the same card on a square mount. The contract's
// media_base points here (<site>/bond/square), because wallets and marketplaces
// crop NFT images to a square.

import { bondSvg } from "@/lib/bond-svg";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return bondSvg((await ctx.params).id, true);
}
