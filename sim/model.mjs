// The CONSUME contract as a plain state machine, for simulation.
//
// The arithmetic is ported line for line from contracts/consume/src/math.rs and
// the rules from meal.rs, vest.rs and redeem.rs, in whole numbers (BigInt), with
// the same rounding. What is left out is everything that is not arithmetic:
// storage fees, token transfers and their failures, price age, the guardian.

export const BPS = 10_000n;
export const MICRO_USD = 1_000_000n; // dollars are counted in millionths
export const ONE_CONSUME = 10n ** 18n;
export const DAY_NS = 86_400n * 1_000_000_000n;

/** The parameters the live contract was launched with (see `get_config`). */
export const LAUNCH = {
  startRate: 1000n, // $CONSUME per dollar into an empty Stomach
  famineUsd: 10_000n * MICRO_USD, // the tithe steps up once per this much eaten
  titheStepBps: 100n,
  maxTitheBps: 1000n,
  vestNs: 30n * DAY_NS,
  exitHaircutBps: 5000n,
  minMealUsd: 1n * MICRO_USD,
  epochNs: 7n * DAY_NS,
};

const min = (a, b) => (a < b ? a : b);
const scale = (decimals) => 10n ** BigInt(decimals) * 10n ** 12n;

// ---------- math.rs ----------

export const mulDiv = (a, b, c) => (a * b) / c;
export const usdValue = (amount, decimals, priceE18) => (amount * priceE18) / scale(decimals);
export const usdValueUp = (amount, decimals, priceE18) => (amount * priceE18 + scale(decimals) - 1n) / scale(decimals);
export const amountForUsd = (usd, decimals, priceE18) => (priceE18 === 0n ? 0n : (usd * scale(decimals)) / priceE18);
export const titheAt = (stepBps, maxBps, famineUsd, totalEaten) => min((totalEaten / famineUsd + 1n) * stepBps, maxBps);
export const nextFamineAt = (famineUsd, totalEaten) => (totalEaten / famineUsd + 1n) * famineUsd;

/** What is left of a feeding after the tithe. A feeding that crosses a step pays each part at its own rate. */
export function afterTithe(stepBps, maxBps, famineUsd, totalEaten, mealUsd) {
  let net = 0n;
  let eaten = totalEaten;
  let left = mealUsd;
  while (left > 0n) {
    const tithe = titheAt(stepBps, maxBps, famineUsd, eaten);
    const take = tithe >= maxBps || stepBps === 0n ? left : min(left, nextFamineAt(famineUsd, eaten) - eaten);
    net += mulDiv(take, BPS - tithe, BPS);
    eaten += take;
    left -= take;
  }
  return net;
}

/** $CONSUME minted for `netUsd`: at the backing, or at the start rate into an empty Stomach. */
export const consumeAtFloor = (startRate, netUsd, claims, stomachUsd) =>
  claims === 0n ? mulDiv(netUsd, startRate * ONE_CONSUME, MICRO_USD) : mulDiv(netUsd, claims, stomachUsd > 1n ? stomachUsd : 1n);

export const applyBps = (amount, bps) => mulDiv(amount, bps, BPS);

export function vested(total, startNs, durationNs, now) {
  if (now <= startNs) return 0n;
  const elapsed = now - startNs;
  return elapsed >= durationNs ? total : mulDiv(total, elapsed, durationNs);
}

// ---------- the contract ----------

export class Consume {
  /** `tokens`: [{ symbol, decimals, priceE18, maxMealUsd, dailyCapUsd }], amounts in the contract's units. */
  constructor(tokens, config = LAUNCH) {
    this.config = config;
    this.tribes = new Map(tokens.map((t) => [t.symbol, { ...t, stomach: 0n }]));
    this.supply = 0n; // minted $CONSUME
    this.unvested = 0n; // $CONSUME still locked in Bonds
    this.forfeited = 0n;
    this.redeemed = 0n;
    this.eatenUsd = 0n;
    this.bonds = [];
    this.balances = new Map();
    this.dailyFed = new Map();
    this.epochFed = new Map();
    this.feasts = new Map(); // week -> the memecoin that feasted in it, written at the week's first feeding
    // counted for the report, not part of the contract's state
    this.tithePaid = 0n;
    this.titheWaived = 0n;
    this.paidOutUsd = 0n;
    this.checks = 0;
  }

  /** Every $CONSUME with a claim on the Stomach: minted plus still locked. */
  claims() {
    return this.supply + this.unvested;
  }

  /** The Stomach's value at the posted prices. Rounded up per memecoin when pricing a feeding, as the contract does. */
  stomachUsd(roundUp = false) {
    let total = 0n;
    for (const t of this.tribes.values()) {
      if (t.stomach === 0n) continue;
      total += (roundUp ? usdValueUp : usdValue)(t.stomach, t.decimals, t.priceE18);
    }
    return total;
  }

  titheNow() {
    const c = this.config;
    return titheAt(c.titheStepBps, c.maxTitheBps, c.famineUsd, this.eatenUsd);
  }

  /** lib.rs `heaviest_tribe`: the memecoin fed the most in a week, leaving out `except`, if any was fed. The first one listed wins a tie. */
  heaviest(epoch, except = null) {
    let best = null;
    let bestFed = 0n;
    for (const symbol of this.tribes.keys()) {
      if (symbol === except) continue;
      const fed = this.epochFed.get(`${symbol}:${epoch}`) ?? 0n;
      if (fed > 0n && (best === null || fed > bestFed)) {
        best = symbol;
        bestFed = fed;
      }
    }
    return best;
  }

  /**
   * lib.rs `feast_for`: the memecoin fed the most the week before, unless it was already
   * feasting that week. No memecoin feasts two weeks running, so a reigning Feast hands the
   * crown to the most fed of the others (and to none if no other was fed).
   */
  feastFor(epoch) {
    // back to the nearest week whose Feast is known
    let known = epoch;
    let feast = null;
    for (;;) {
      if (known === 0n) break;
      if (this.feasts.has(known)) {
        feast = this.feasts.get(known);
        break;
      }
      if (this.heaviest(known - 1n) === null) break; // nothing was fed the week before: no Feast
      known -= 1n;
    }
    // then forward again, one crowning at a time
    for (let e = known + 1n; e <= epoch; e += 1n) feast = this.heaviest(e - 1n, feast);
    return feast;
  }

  /** The memecoin whose feedings pay no tithe at `now`. */
  feast(now) {
    return this.feastFor(now / this.config.epochNs);
  }

  /** meal.rs `plan_meal` and `eat`. Returns the Bond, or why the feeding was refused. */
  feed(owner, symbol, amount, now) {
    const c = this.config;
    const tribe = this.tribes.get(symbol);
    const day = now / DAY_NS;
    const fedToday = this.dailyFed.get(`${symbol}:${day}`) ?? 0n;
    const room = tribe.dailyCapUsd > fedToday ? tribe.dailyCapUsd - fedToday : 0n;
    const allowed = min(room, tribe.maxMealUsd);
    if (allowed === 0n) return { refused: "full" };

    const fullUsd = usdValue(amount, tribe.decimals, tribe.priceE18);
    let accepted = amount;
    let mealUsd = fullUsd;
    if (fullUsd > allowed) {
      accepted = min(amountForUsd(allowed, tribe.decimals, tribe.priceE18), amount);
      mealUsd = usdValue(accepted, tribe.decimals, tribe.priceE18);
    }
    if (mealUsd < c.minMealUsd) return { refused: "small" };

    const epoch = now / c.epochNs;
    const bonus = this.feastFor(epoch) === symbol;
    const taxed = afterTithe(c.titheStepBps, c.maxTitheBps, c.famineUsd, this.eatenUsd, mealUsd);
    const netUsd = bonus ? mealUsd : taxed;
    const before = { stomach: this.stomachUsd(), claims: this.claims() };
    const consume = consumeAtFloor(c.startRate, netUsd, before.claims, this.stomachUsd(true));
    if (consume === 0n) return { refused: "nothing" };

    // lib.rs `record_feast`: the week's first feeding writes down who feasts in it
    if (!this.feasts.has(epoch)) this.feasts.set(epoch, this.feastFor(epoch));
    tribe.stomach += accepted;
    this.dailyFed.set(`${symbol}:${day}`, fedToday + mealUsd);
    this.epochFed.set(`${symbol}:${epoch}`, (this.epochFed.get(`${symbol}:${epoch}`) ?? 0n) + mealUsd);
    this.eatenUsd += mealUsd;
    this.unvested += consume;
    const bond = { id: this.bonds.length + 1, owner, symbol, mealUsd, total: consume, released: 0n, startNs: now, exited: false, bonus };
    this.bonds.push(bond);
    this.tithePaid += mealUsd - netUsd;
    if (bonus) this.titheWaived += mealUsd - taxed;
    this.holds(before, 0n, "a feeding");
    return { bond };
  }

  /** vest.rs `split`: (released and not yet collected, still locked). */
  split(bond, now) {
    if (bond.exited) return [0n, 0n];
    const v = vested(bond.total, bond.startNs, this.config.vestNs, now);
    return [v > bond.released ? v - bond.released : 0n, bond.total - v];
  }

  mint(owner, amount) {
    if (amount === 0n) return;
    this.supply += amount;
    this.balances.set(owner, (this.balances.get(owner) ?? 0n) + amount);
  }

  /** vest.rs `claim`: collect what has been released. */
  claim(bond, now) {
    const [claimable] = this.split(bond, now);
    if (claimable === 0n) return 0n;
    bond.released += claimable;
    this.unvested -= claimable;
    this.mint(bond.owner, claimable);
    return claimable;
  }

  /** vest.rs `exit`: break the seal. Half of what is still locked is never minted. */
  exit(bond, now) {
    if (bond.exited) return 0n;
    const before = { stomach: this.stomachUsd(), claims: this.claims() };
    const [claimable, locked] = this.split(bond, now);
    const forfeited = applyBps(locked, this.config.exitHaircutBps);
    const payout = claimable + locked - forfeited;
    this.unvested -= bond.total - bond.released;
    this.forfeited += forfeited;
    bond.released += payout;
    bond.exited = true;
    this.mint(bond.owner, payout);
    this.holds(before, 0n, "a broken seal");
    return payout;
  }

  /** redeem.rs `redeem`: burn $CONSUME for the same share of every memecoin held. */
  redeem(owner, amount) {
    const held = this.balances.get(owner) ?? 0n;
    if (amount === 0n || amount > held) return false;
    const before = { stomach: this.stomachUsd(), claims: this.claims() };
    const shares = [...this.tribes.values()].map((t) => [t, mulDiv(t.stomach, amount, before.claims)]);
    if (!shares.some(([, s]) => s > 0n)) return false;
    for (const [t, share] of shares) {
      t.stomach -= share;
      this.paidOutUsd += usdValue(share, t.decimals, t.priceE18);
    }
    this.balances.set(owner, held - amount);
    this.supply -= amount;
    this.redeemed += amount;
    // each memecoin's value is rounded down on its own, so allow a millionth of a dollar per memecoin
    this.holds(before, BigInt(this.tribes.size), "a redemption");
    return true;
  }

  /** The promise the whole design rests on: no feeding, broken seal or redemption lowers the backing of each $CONSUME. */
  holds(before, slackMicroUsd, what) {
    this.checks += 1;
    if (before.claims === 0n) return;
    const after = { stomach: this.stomachUsd(), claims: this.claims() };
    if ((after.stomach + slackMicroUsd) * before.claims < before.stomach * after.claims) {
      throw new Error(`${what} lowered the backing: ${before.stomach}/${before.claims} -> ${after.stomach}/${after.claims}`);
    }
  }
}
