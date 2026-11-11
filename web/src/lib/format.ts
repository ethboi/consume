// Fixed-point helpers. Token amounts stay BigInt until they are shown.

const TEN = BigInt(10);

export function pow10(n: number): bigint {
  return TEN ** BigInt(n);
}

/** "1234.5" whole units -> raw bigint with `decimals`. Returns null if malformed. */
export function toRaw(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * pow10(decimals) + BigInt(fracPadded || "0");
}

/** Raw -> human string with thousands separators and at most `maxFrac` decimals. */
export function fromRaw(raw: bigint | string, decimals: number, maxFrac = 2): string {
  const v = typeof raw === "string" ? BigInt(raw) : raw;
  const whole = v / pow10(decimals);
  const frac = v % pow10(decimals);
  let fracStr = decimals > 0 ? frac.toString().padStart(decimals, "0").slice(0, maxFrac) : "";
  fracStr = fracStr.replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  if (whole === BigInt(0) && fracStr === "" && v > BigInt(0)) {
    // very small: show significant digits instead of 0
    const full = frac.toString().padStart(decimals, "0");
    const firstNz = full.search(/[1-9]/);
    return "0." + full.slice(0, firstNz + 2).replace(/0+$/, "");
  }
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

/** Whole-token string, compact for big numbers: 20,000,000 -> "20M". */
export function compact(raw: bigint | string, decimals: number): string {
  const v = typeof raw === "string" ? BigInt(raw) : raw;
  const n = Number(v / pow10(Math.max(0, decimals - 6))) / 1e6;
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

/** micro-USD string -> "$1,234.56" */
export function usd(micro: bigint | string, frac = 2): string {
  const v = Number(typeof micro === "string" ? BigInt(micro) : micro) / 1e6;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: frac, maximumFractionDigits: frac });
}

/** USD value in micro-USD of `raw` units priced at `priceE18` per whole token. */
export function usdValue(raw: bigint | string, decimals: number, priceE18: bigint | string): bigint {
  const r = typeof raw === "string" ? BigInt(raw) : raw;
  const p = typeof priceE18 === "string" ? BigInt(priceE18) : priceE18;
  return (r * p) / pow10(decimals) / pow10(12);
}

export function shortAccount(a: string): string {
  return a.length > 26 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a;
}

export function daysLeft(startNs: string, durationNs: string, nowMs = Date.now()): number {
  const end = (Number(BigInt(startNs) / BigInt(1_000_000)) + Number(BigInt(durationNs) / BigInt(1_000_000)));
  return Math.max(0, (end - nowMs) / 86_400_000);
}

export function vestedFraction(startNs: string, durationNs: string, nowMs = Date.now()): number {
  const start = Number(BigInt(startNs) / BigInt(1_000_000));
  const dur = Number(BigInt(durationNs) / BigInt(1_000_000));
  return Math.min(1, Math.max(0, (nowMs - start) / dur));
}

/** micro-USD -> "$12.5K", "$4.2M", "$980" (whole dollars under a thousand, like the Stomach's own figure) */
export function usdCompact(micro: bigint | string): string {
  const v = Number(typeof micro === "string" ? BigInt(micro) : micro) / 1e6;
  return Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: Math.abs(v) < 1000 ? 0 : 1 }).format(v);
}
