// The ten memecoins CONSUME eats. Each is routable through NEAR Intents
// (checked with 1Click dry quotes on 2026-11-09). On mainnet the token is the
// Intents-bridged NEP-141 below; on testnet a mock with the same decimals.

export type Heresy = {
  symbol: string;
  /** Home chain of the real coin. */
  chain: "Dogecoin" | "Ethereum" | "Solana" | "NEAR";
  /** Mainnet NEP-141 contract (Intents-bridged, or native on NEAR). */
  mainnet: string;
  decimals: number;
  /** Testnet mock sub-account name, e.g. "pepe" -> pepe.<deployer>. */
  mock: string;
  /** Faucet drop on testnet, in whole tokens (roughly $100 worth). */
  faucetWhole: string;
  /** Daily and per-meal caps in USD (tighter for thin home-team coins). */
  maxMealUsd: number;
  dailyCapUsd: number;
};

export const HERESIES: Heresy[] = [
  { symbol: "DOGE", chain: "Dogecoin", mainnet: "doge.omft.near", decimals: 8, mock: "doge", faucetWhole: "1500", maxMealUsd: 1000, dailyCapUsd: 5000 },
  { symbol: "SHIB", chain: "Ethereum", mainnet: "eth-0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce.omft.near", decimals: 18, mock: "shib", faucetWhole: "22000000", maxMealUsd: 1000, dailyCapUsd: 5000 },
  { symbol: "PEPE", chain: "Ethereum", mainnet: "eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near", decimals: 18, mock: "pepe", faucetWhole: "20000000", maxMealUsd: 1000, dailyCapUsd: 5000 },
  { symbol: "PENGU", chain: "Solana", mainnet: "sol-0xaad74c68eecfc9f8c5bdcea614f6167048c795ef.omdep.near", decimals: 6, mock: "pengu", faucetWhole: "15000", maxMealUsd: 1000, dailyCapUsd: 5000 },
  { symbol: "SPX", chain: "Ethereum", mainnet: "eth-0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c.omft.near", decimals: 8, mock: "spx", faucetWhole: "275", maxMealUsd: 1000, dailyCapUsd: 5000 },
  { symbol: "TURBO", chain: "Ethereum", mainnet: "eth-0xa35923162c49cf95e6bf26623385eb431ad920d3.omft.near", decimals: 18, mock: "turbo", faucetWhole: "140000", maxMealUsd: 500, dailyCapUsd: 2500 },
  { symbol: "BOME", chain: "Solana", mainnet: "sol-57d087fd8c460f612f8701f5499ad8b2eec5ab68.omft.near", decimals: 6, mock: "bome", faucetWhole: "160000", maxMealUsd: 500, dailyCapUsd: 2500 },
  { symbol: "BLACKDRAGON", chain: "NEAR", mainnet: "blackdragon.tkn.near", decimals: 24, mock: "blackdragon", faucetWhole: "15000000000", maxMealUsd: 100, dailyCapUsd: 300 },
  { symbol: "SHITZU", chain: "NEAR", mainnet: "token.0xshitzu.near", decimals: 18, mock: "shitzu", faucetWhole: "70000", maxMealUsd: 100, dailyCapUsd: 300 },
  { symbol: "NearKat", chain: "NEAR", mainnet: "kat.token0.near", decimals: 18, mock: "nearkat", faucetWhole: "1100000", maxMealUsd: 50, dailyCapUsd: 150 },
];

export const bySymbol = (s: string) => HERESIES.find((h) => h.symbol === s);

// where a long name may break on a narrow screen (a soft hyphen, unseen until it is needed)
const SOFT: Record<string, string> = { BLACKDRAGON: "BLACK­DRAGON" };

/** A memecoin's name as it is printed under its coin: the same letters, free to break where the column is narrow. */
export const printed = (symbol: string) => SOFT[symbol] ?? symbol;
