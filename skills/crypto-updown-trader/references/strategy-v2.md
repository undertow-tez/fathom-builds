# Strategy v2 — Probability + EV Engine

## Why v2 exists

The v1 strategy (`strategy.js`) scores technical-momentum indicators (MA/RSI/
candles) and bets when the score is strong. That approach has no measurable
edge on 15-minute crypto markets, for three structural reasons:

1. **It never looks at the price it pays.** Win rate is irrelevant — a 64%
   win rate is profitable at a $0.53 entry and a loser at $0.68. EV, not win
   rate, decides whether you make money.
2. **The "ties resolve UP" edge is already priced in.** UP shares cost >$0.50
   *because* the market knows ties go UP. It is not free money.
3. **It ignores the one predictive variable** — where spot already sits
   relative to the window's strike (open) price, and how much time is left.

v2 fixes all three. It estimates a probability, compares it to the price, and
bets **only on positive expected value**.

## The model (`lib/model.js`)

For a window with strike (open) price `K`, current spot `S`, per-minute
volatility `σ`, and `t` minutes left:

```
P(up) = Φ( ln(S/K) / (σ · √t) )
```

This is a driftless log-normal barrier probability — the chance spot finishes
at or above the strike. Ties resolve UP, so we use `≥`, with a small optional
`tieBias` nudge that grows as expiry approaches.

From `P` and the market price `a` you would pay for a $1-payout share:

```
EV per $         = P/a − 1        (positive ⇒ bet is +EV)
Kelly fraction   = (P − a)/(1 − a)
bet size         = min(kellyFraction · f*, maxBetFraction) · bankroll
```

We bet the side whose edge `P − a` clears `minEdge` (default 4 prob-points,
to cover spread + gas + slippage) and whose price is below `maxPrice`.

## The data (`lib/market.js`)

- **Candles / spot / vol:** Binance 1-min klines (local price-feed cache first).
- **Strike:** the OPEN of the window's first minute.
- **Window / slug:** `floor(epoch / tfSeconds) · tfSeconds`. Because the offset
  from UTC to ET is a whole number of hours, this lands on the same
  :00/:15/:30/:45 boundary in both zones — so there is **no timezone math and
  no DST bug** (the v1 scripts hard-coded UTC−5, which is wrong half the year).
- **Market price:** Polymarket gamma `outcomePrices`.

## Shadow → live protocol

This is the whole point: **prove the edge on paper before risking a dollar.**

```
mode: "shadow"   ← DEFAULT. Evaluates every window, logs the decision it WOULD
                   make, places no bets. Zero capital at risk.
mode: "live"     ← Places the emitted bet via bet.sh.
```

Every window — bet or not — is written as one row to `windows.jsonl` (the
single source of truth). After windows close, `resolve-windows.js` fills in the
actual outcome and the paper P&L.

### Reading the results

```bash
node resolve-windows.js      # settle closed windows
node backtest.js             # calibration + paper P&L
node backtest.js --all       # + side / asset / time-left splits
```

The two numbers that gate going live:

1. **Calibration (Brier score).** Across *all* resolved windows, does model
   `P(up)` match the actual UP frequency? A tight calibration curve and
   **Brier < ~0.24** means the probabilities are trustworthy. If calibration is
   poor, the "edges" are model error (usually a strike/vol mismatch), not alpha.
2. **Paper ROI.** Over **100+ resolved paper bets across multiple sessions**,
   is realized P&L positive and is it roughly tracking predicted EV?

**Only flip `mode` to `live` when both hold.** Until then, shadow mode is
doing its job: collecting clean evidence for free.

## Known limitations (be honest about these)

- **Strike basis:** we use the Binance candle open as the strike; Polymarket
  settles on a Chainlink stream. A small basis between the two can create
  fake edges near the strike. Watch whether near-strike (`|distance|` small,
  large edge) windows resolve in our favor — if not, this is why.
- **Price is a mid, not an ask:** gamma `outcomePrices` is a mark, not the live
  CLOB ask you would actually pay. Real fills are worse, so treat shadow ROI as
  an optimistic upper bound. Live mode should move to the CLOB orderbook ask.
- **Execution latency:** Bankr takes 75–140s. On a 15-min window that both
  shrinks time-left and gives an unknown fill price. `minMinutesLeft` guards
  the worst of it, but latency is the biggest threat to the live edge and may
  require direct CLOB order placement.
- **Volatility is trailing:** `σ` from the last 30 minutes lags regime changes
  (news spikes). Expect the model to misprice during volatility bursts.

## Files

| File | Purpose |
|------|---------|
| `lib/model.js` | Pure math: `probUp`, `evPerDollar`, `kellyFraction`, `decide`. Unit-tested. |
| `lib/market.js` | Binance + gamma data, window/slug, feature builder. |
| `strategy-v2.js` | Engine: features → decision → append to `windows.jsonl`. |
| `resolve-windows.js` | Settle closed windows, fill outcome + paper P&L. |
| `backtest.js` | Calibration, Brier, paper P&L, edge/side/time splits. |
| `cycle-v2.sh` | Cron cycle: resolve → evaluate per asset → (live) bet. |
| `test/model.test.js` | Deterministic model tests (`node test/model.test.js`). |
