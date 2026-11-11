// The stops of "Take the tour", in the order the page runs. `id` is the
// section's own, `line` the one sentence said there. Kept apart from the
// component so the browser test reads the same list the page shows.

export const TOUR = [
  { id: "feed", name: "Feed the Serpent", line: "Pick one of ten memecoins and feed it. It goes into the Stomach, and you get a Bond." },
  { id: "bonds", name: "Bonds", line: "A Bond is an NFT that pays you $CONSUME over 30 days. Collect whenever you like." },
  { id: "transmute", name: "Redeem", line: "Burn $CONSUME for your share of every memecoin in the Stomach." },
  { id: "crucible", name: "The Serpent’s Stomach", line: "Every memecoin fed sits here, backing each $CONSUME." },
  { id: "feast", name: "The Feast", line: "Each week the most fed memecoin feasts: the week after, feeding it pays no tithe." },
  { id: "ledger", name: "The Ledger", line: "Every feeding, mint and burn, each with its transaction." },
] as const;

export const TOUR_NUMERALS = ["I", "II", "III", "IV", "V", "VI"] as const;
