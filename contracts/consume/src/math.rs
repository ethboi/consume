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

/// Raw $CONSUME (18 decimals) per USD once `total_eaten` micro-USD has been
/// eaten. Kept in raw units so halvings stay exact (125 halves to 62.5, not 62).
pub fn rate_at(start_rate: u128, halving_usd: u128, total_eaten: u128) -> u128 {
    let halvings = total_eaten / halving_usd;
    if halvings >= 128 {
        0
    } else {
        (start_rate * ONE_CONSUME) >> halvings
    }
}

pub fn next_halving_at(halving_usd: u128, total_eaten: u128) -> u128 {
    (total_eaten / halving_usd + 1) * halving_usd
}

/// $CONSUME (raw, 18 decimals) earned by a meal worth `meal_usd` micro-USD,
/// starting when `total_eaten` micro-USD has already been eaten. A meal that
/// crosses a halving is paid at each rate for the part on each side.
pub fn consume_for_meal(start_rate: u128, halving_usd: u128, total_eaten: u128, meal_usd: u128) -> u128 {
    let mut minted: u128 = 0;
    let mut eaten = total_eaten;
    let mut left = meal_usd;
    while left > 0 {
        let rate = rate_at(start_rate, halving_usd, eaten);
        if rate == 0 {
            break;
        }
        let era_end = next_halving_at(halving_usd, eaten);
        let take = left.min(era_end - eaten);
        // take micro-USD * raw-CONSUME-per-USD -> raw units
        minted += mul_div(take, rate, MICRO_USD);
        eaten += take;
        left -= take;
    }
    minted
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
