//! Pure arithmetic, kept separate so it can be tested without a contract.

use near_sdk::env;
use uint::construct_uint;

use crate::{BPS, MICRO_USD, ONE_CONSUME};

construct_uint! {
    pub struct U256(4);
}

/// a * b / c with a 256-bit intermediate. Panics if the result does not fit in u128.
pub fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    if c == 0 {
        env::panic_str("division by zero");
    }
    let r = U256::from(a) * U256::from(b) / U256::from(c);
    if r > U256::from(u128::MAX) {
        env::panic_str("overflow");
    }
    r.as_u128()
}

/// USD value (micro-USD) of `amount` raw units of a token with `decimals`,
/// priced at `price_e18` USD per whole token.
pub fn usd_value(amount: u128, decimals: u8, price_e18: u128) -> u128 {
    // amount * price_e18 / 10^decimals / 1e12  (1e18 price scale -> 1e6 micro-USD)
    let scale = U256::from(10u8).pow(U256::from(decimals)) * U256::from(1_000_000_000_000u64);
    let r = U256::from(amount) * U256::from(price_e18) / scale;
    if r > U256::from(u128::MAX) {
        env::panic_str("overflow");
    }
    r.as_u128()
}

/// The same, rounded up. The stomach is valued this way when a feeding is
/// priced against it, so rounding can never mint a feeding more than its share.
pub fn usd_value_up(amount: u128, decimals: u8, price_e18: u128) -> u128 {
    let scale = U256::from(10u8).pow(U256::from(decimals)) * U256::from(1_000_000_000_000u64);
    let r = (U256::from(amount) * U256::from(price_e18) + scale - U256::from(1u8)) / scale;
    if r > U256::from(u128::MAX) {
        env::panic_str("overflow");
    }
    r.as_u128()
}

/// Raw token units worth `usd` micro-USD. Inverse of `usd_value` (rounded down).
pub fn amount_for_usd(usd: u128, decimals: u8, price_e18: u128) -> u128 {
    if price_e18 == 0 {
        return 0;
    }
    let scale = U256::from(10u8).pow(U256::from(decimals)) * U256::from(1_000_000_000_000u64);
    let r = U256::from(usd) * scale / U256::from(price_e18);
    if r > U256::from(u128::MAX) {
        env::panic_str("overflow");
    }
    r.as_u128()
}

/// The tithe, in basis points, once `total_eaten` micro-USD has been eaten:
/// one step from the start and one more for every `famine_usd` eaten, never
/// above `max_bps`.
pub fn tithe_at(step_bps: u128, max_bps: u128, famine_usd: u128, total_eaten: u128) -> u128 {
    (total_eaten / famine_usd).saturating_add(1).saturating_mul(step_bps).min(max_bps)
}

/// Total eaten (micro-USD) at which the tithe steps up next.
pub fn next_famine_at(famine_usd: u128, total_eaten: u128) -> u128 {
    (total_eaten / famine_usd + 1) * famine_usd
}

/// What is left of a feeding worth `meal_usd` after the tithe, starting when
/// `total_eaten` has already been eaten. A feeding that crosses a famine pays
/// each tithe on the part on each side. Rounded down.
pub fn after_tithe(step_bps: u128, max_bps: u128, famine_usd: u128, total_eaten: u128, meal_usd: u128) -> u128 {
    let mut net: u128 = 0;
    let mut eaten = total_eaten;
    let mut left = meal_usd;
    while left > 0 {
        let tithe = tithe_at(step_bps, max_bps, famine_usd, eaten);
        // once the tithe has stopped growing the rest is all at one rate
        let take = if tithe >= max_bps || step_bps == 0 { left } else { left.min(next_famine_at(famine_usd, eaten) - eaten) };
        net += mul_div(take, BPS - tithe, BPS);
        eaten += take;
        left -= take;
    }
    net
}

/// $CONSUME (raw, 18 decimals) minted for `net_usd` micro-USD at the floor:
/// the new claim is the same share of the stomach as `net_usd` is of its value,
/// so a feeding never lowers what each existing $CONSUME is backed by.
/// `claims` is all $CONSUME, minted or still locked in Bonds; `stomach_usd` is
/// the stomach's value before this feeding. An empty stomach (or no claims)
/// starts at `start_rate` whole $CONSUME per USD.
pub fn consume_at_floor(start_rate: u128, net_usd: u128, claims: u128, stomach_usd: u128) -> u128 {
    if claims == 0 {
        mul_div(net_usd, start_rate * ONE_CONSUME, MICRO_USD)
    } else {
        // a stomach worth under a micro-dollar counts as one: the start rate here
        // would hand part of the feeding to the claims already out
        mul_div(net_usd, claims, stomach_usd.max(1))
    }
}

pub fn apply_bps(amount: u128, bps: u128) -> u128 {
    mul_div(amount, bps, BPS)
}

/// How much of `total` has vested at `now`.
pub fn vested(total: u128, start_ns: u64, duration_ns: u64, now: u64) -> u128 {
    if now <= start_ns {
        return 0;
    }
    let elapsed = (now - start_ns) as u128;
    if elapsed >= duration_ns as u128 {
        total
    } else {
        mul_div(total, elapsed, duration_ns as u128)
    }
}
