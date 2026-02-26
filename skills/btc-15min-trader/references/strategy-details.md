# Strategy Technical Details

## Momentum Scoring Algorithm

### Input: 60 BTC 1-minute candles from Binance

### Indicators Computed

**Moving Averages:**
- MA5 (5-candle simple moving average)
- MA10 (10-candle simple moving average)
- MA20 (20-candle simple moving average)

**RSI (14-period):**
- Standard Relative Strength Index calculation
- >60 = bullish zone, <40 = bearish zone

**Volatility:**
- Standard deviation of last 10 close prices as % of mean
- Low volatility (<0.1%) = tie likely → UP edge

**Candle Direction:**
- Count of UP candles in last 5 and last 10
- UP = close > open

**Volume:**
- Compare recent 5-candle avg volume to previous 5-candle avg
- Rising volume confirms current direction

### Scoring Rules

```
Score starts at 0

MA Alignment:
  MA5 > MA10 > MA20 → +2 (strong uptrend)
  MA5 > MA10         → +1 (short-term bullish)
  MA5 < MA10 < MA20  → -2 (strong downtrend)
  MA5 < MA10         → -1 (short-term bearish)

Candle Direction (5-candle):
  4-5/5 UP  → +1
  4-5/5 DOWN → -1
  Mixed     → 0

RSI:
  >60 → +1 (bullish momentum)
  <40 → -1 (bearish momentum)
  40-60 → 0 (neutral)

Volatility:
  <0.1% → +0.3 (low vol = ties likely = UP edge)

Volume:
  Rising + score positive → +0.5 (confirms UP)
  Rising + score negative → -0.5 (confirms DOWN)

Final score range: approximately -5 to +5
```

### Decision Thresholds

| Score | Decision | Confidence |
|-------|----------|-----------|
| ≥ 2 | BET_UP | MEDIUM-HIGH |
| ≤ -2 | BET_DOWN | MEDIUM-HIGH |
| -2 to 2 | NO_BET | LOW (skip) |

### Output Format

Strategy outputs a machine-readable signal line:
```
__SIGNAL__:BET_UP:4.2:67385.80:3
```
Format: `__SIGNAL__:{decision}:{score}:{btc_price}:{bet_size}`

## Gamma API Slug Calculation

Polymarket 15-min BTC markets use predictable slugs based on the window start time.

### Formula
```
1. Get current time in ET (Eastern Time, UTC-5)
2. Round down minutes to nearest :00/:15/:30/:45
3. Convert that ET time to UTC unix epoch
4. Slug = "btc-updown-15m-{epoch}"
```

### Example
```
Current: 12:08 PM ET, Feb 26, 2026
Window start: 12:00 PM ET = 17:00 UTC = 1772125200
Slug: btc-updown-15m-1772125200
API: GET https://gamma-api.polymarket.com/markets?slug=btc-updown-15m-1772125200
```

### Edge Cases
- At exact boundary (:00/:15/:30/:45), the script also checks the previous window (-900 seconds)
- Markets may not appear on gamma API until ~7 min after window opens
- Always verify `closed: false` and `endDate` is > 2 min in the future

## Bankr Execution Details

### Bet Placement
```
Buy $3 of Up shares for "Bitcoin Up or Down - February 26, 12:00PM-12:15PM ET" on Polymarket. Execute the trade.
```
- Must use EXACT market title from gamma API (quotes around title)
- Bankr executes on Polygon using USDC.e balance
- Typical execution: 75-140 seconds
- Use bankr-submit.sh for async (returns jobId immediately)

### Position Check
```
Check my Polymarket positions
```

### Redemption
```
Redeem my position on 'Bitcoin Up or Down - February 26, 12:00PM-12:15PM ET' on Polymarket
```

### Sell (to exit early)
```
Sell all my UP shares in 'Bitcoin Up or Down - February 26, 12:00PM-12:15PM ET' on Polymarket
```

## Resolution Mechanics

- **Source:** Chainlink BTC/USD data stream
- **UP wins:** End-of-window price ≥ start-of-window price
- **DOWN wins:** End-of-window price < start-of-window price
- **Ties → UP** (critical edge for the strategy)
- **Resolution time:** 5-15 min after window closes
- **On-chain:** Gnosis CTF on Polygon, `payoutDenominator(conditionId) > 0` = resolved
