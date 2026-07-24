'use strict';
/**
 * model.js — Probability + EV core for Up/Down binary markets.
 *
 * This is the "brain" of the v2 strategy. It contains NO I/O and NO
 * network calls — just deterministic math — so it can be unit-tested and
 * backtested exactly.
 *
 * The thesis (see references/strategy-v2.md):
 *   The only durable edge in a short crypto up/down market is a divergence
 *   between OUR estimate of P(up) and the price the market is charging.
 *   We estimate P(up) from where spot already sits relative to the window's
 *   strike (open) price and how much time is left, then bet ONLY when that
 *   probability beats the price we would actually pay, by enough to cover
 *   costs. Win rate is irrelevant; expected value net of price is everything.
 */

// --- Normal CDF via Abramowitz & Stegun 7.1.26 erf approximation ---
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

function normalCDF(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * probUp — probability spot finishes >= strike at window close.
 *
 * Model: log-return over remaining time is Normal(0, sigma^2 * t) with ~0
 * drift (valid at minute horizons). Ties resolve UP, so we want P(>=).
 *
 *   P(up) = Phi( ln(spot/strike) / (sigmaPerMin * sqrt(minutesLeft)) )
 *
 * @param {number} spot         current price
 * @param {number} strike       window-open (strike) price
 * @param {number} sigmaPerMin  stdev of 1-min log returns
 * @param {number} minutesLeft  minutes until window close (can be fractional)
 * @param {number} [tieBias=0]  small prob added for the tie->UP structural edge,
 *                              applied as minutesLeft -> 0 shrinks the diffusion.
 * @returns {number} probability in [0,1]
 */
function probUp(spot, strike, sigmaPerMin, minutesLeft, tieBias = 0) {
  if (!(spot > 0) || !(strike > 0)) return 0.5;
  // No time or no volatility => deterministic on current sign (ties -> UP).
  if (minutesLeft <= 0 || sigmaPerMin <= 0) {
    return spot >= strike ? 1 : 0;
  }
  const drift = Math.log(spot / strike);
  const denom = sigmaPerMin * Math.sqrt(minutesLeft);
  let p = normalCDF(drift / denom);
  // Tie edge: nudge toward UP, strongest when little time remains.
  if (tieBias > 0) {
    const w = 1 / (1 + minutesLeft); // more weight near expiry
    p = p + tieBias * w * (1 - p);
  }
  return Math.min(1, Math.max(0, p));
}

/**
 * Per-minute volatility (stdev of 1-min log returns) from a candle array.
 * Candles are {open, close, ...} newest-last.
 */
function volPerMinute(candles, lookback = 30) {
  if (!candles || candles.length < 3) return 0;
  const slice = candles.slice(-Math.min(lookback, candles.length - 1) - 1);
  const rets = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].close;
    const cur = slice[i].close;
    if (prev > 0 && cur > 0) rets.push(Math.log(cur / prev));
  }
  if (rets.length < 2) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varc = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(varc);
}

/**
 * Per-dollar expected value of buying a $1-payout share at `price`, given
 * true win probability `p`. Positive means +EV.
 *   spend $1 -> 1/price shares -> payout 1/price if win, 0 if lose
 *   EV/$ = p/price - 1
 */
function evPerDollar(p, price) {
  if (!(price > 0)) return -1;
  return p / price - 1;
}

/**
 * Kelly fraction of bankroll for buying a $1-payout share at `price`.
 *   f* = (p - price) / (1 - price)
 * Returns 0 when the bet is not +EV.
 */
function kellyFraction(p, price) {
  if (!(price > 0) || price >= 1) return 0;
  const f = (p - price) / (1 - price);
  return f > 0 ? f : 0;
}

/**
 * Full decision for one window.
 *
 * @param {object} f  features
 *   { spot, strike, sigmaPerMin, minutesLeft, upPrice, downPrice }
 *   upPrice/downPrice = ask you would pay for a $1-payout share (implied prob).
 * @param {object} cfg
 *   { minEdge, kellyFraction, maxBetFraction, bankroll, tieBias, maxPrice }
 * @returns {object} decision record (no side effects)
 */
function decide(f, cfg) {
  const {
    minEdge = 0.04,
    kellyFraction: kellyMult = 0.25,
    maxBetFraction = 0.02,
    bankroll = 100,
    tieBias = 0,
    maxPrice = 0.97, // never pay near-certainty prices (no room, high tail risk)
  } = cfg || {};

  const pUp = probUp(f.spot, f.strike, f.sigmaPerMin, f.minutesLeft, tieBias);
  const pDown = 1 - pUp;

  const upPrice = f.upPrice;
  const downPrice = f.downPrice;

  const edgeUp = upPrice != null ? pUp - upPrice : null; // prob points
  const edgeDown = downPrice != null ? pDown - downPrice : null;
  const evUp = upPrice != null ? evPerDollar(pUp, upPrice) : null;
  const evDown = downPrice != null ? evPerDollar(pDown, downPrice) : null;

  // Pick the better +EV side that clears the edge threshold and price cap.
  const candidates = [];
  if (edgeUp != null && edgeUp >= minEdge && upPrice <= maxPrice) {
    candidates.push({ side: 'UP', price: upPrice, p: pUp, edge: edgeUp, ev: evUp });
  }
  if (edgeDown != null && edgeDown >= minEdge && downPrice <= maxPrice) {
    candidates.push({ side: 'DOWN', price: downPrice, p: pDown, edge: edgeDown, ev: evDown });
  }
  candidates.sort((a, b) => b.ev - a.ev);

  const base = {
    pUp: round(pUp, 4),
    pDown: round(pDown, 4),
    upPrice,
    downPrice,
    edgeUp: edgeUp != null ? round(edgeUp, 4) : null,
    edgeDown: edgeDown != null ? round(edgeDown, 4) : null,
    evUp: evUp != null ? round(evUp, 4) : null,
    evDown: evDown != null ? round(evDown, 4) : null,
  };

  if (candidates.length === 0) {
    return { ...base, decision: 'NO_BET', side: null, size: 0, reason: 'no side clears minEdge' };
  }

  const best = candidates[0];
  const fKelly = kellyFraction(best.p, best.price) * kellyMult;
  const frac = Math.min(fKelly, maxBetFraction);
  const size = round(frac * bankroll, 2);

  if (size <= 0) {
    return { ...base, decision: 'NO_BET', side: null, size: 0, reason: 'kelly size <= 0' };
  }

  return {
    ...base,
    decision: `BET_${best.side}`,
    side: best.side,
    price: round(best.price, 4),
    modelP: round(best.p, 4),
    edge: round(best.edge, 4),
    ev: round(best.ev, 4),
    kellyFrac: round(fKelly, 4),
    size,
    reason: `edge ${round(best.edge * 100, 1)}pp, EV/$ ${round(best.ev, 3)}`,
  };
}

function round(x, dp) {
  const m = 10 ** dp;
  return Math.round(x * m) / m;
}

module.exports = {
  erf,
  normalCDF,
  probUp,
  volPerMinute,
  evPerDollar,
  kellyFraction,
  decide,
  round,
};
