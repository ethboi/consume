// The Feast, as the contract decides it (contracts/consume/src/lib.rs,
// `feast_for`): each week the most fed memecoin wins, and feeding it pays no
// tithe the week after. No memecoin feasts two weeks running, so the one
// feasting now is left out of this week's race.
//
// The site, the MCP tools and the bots all read the rule from here. It imports
// nothing and uses no BigInt literals, since Node runs it straight from source
// for the bots and the site compiles to ES2017.

/** What `get_stats` says about the Feast. Token ids, not symbols. */
export type FeastStats = {
  /** The memecoin feasting this week. A contract built before the rule does not report it. */
  feast?: string | null;
  /** Last week's most fed memecoin, whether or not it could feast. */
  heaviest_last_epoch: string | null;
};

/** One week's feedings as `get_epoch_fed` returns them: [token id, micro-USD] in the contract's listed order. */
export type Fed = [string, string][];

const ZERO = BigInt(0);

/** The memecoin feasting this week. On a contract from before the rule that is simply last week's most fed. */
export function feastOf(stats: FeastStats): string | null {
  return stats.feast !== undefined ? stats.feast : stats.heaviest_last_epoch;
}

/** The memecoin that cannot win this week's race: the one feasting now. Null on a contract from before the rule. */
export function sittingOut(stats: FeastStats): string | null {
  return stats.feast ?? null;
}

/**
 * Who would feast next week if this one ended now: the most fed memecoin,
 * leaving out the one that is feasting. Equal amounts go to the first listed,
 * as in the contract.
 */
export function nextFeast(fed: Fed, stats: FeastStats): string | null {
  const out = sittingOut(stats);
  let best: string | null = null;
  let most = ZERO;
  for (const [token, micro] of fed) {
    if (token === out) continue;
    const amount = BigInt(micro);
    if (amount > most) {
      best = token;
      most = amount;
    }
  }
  return best;
}
