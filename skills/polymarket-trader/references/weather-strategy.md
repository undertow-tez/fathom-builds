# Weather Market Strategy — Deep Dive

## How Polymarket temperature markets work

Each city gets a daily event like **"Highest temperature in NYC on July 4?"** with mutually exclusive integer-bucket markets:

```
83°F or below    ← open-ended low bucket
84-85°F
86-87°F          ← 2-degree buckets in the likely range
88-89°F
90°F or above    ← open-ended high bucket
```

Resolution: the **maximum temperature reported for that calendar day (local time) at one specific named station** — the market description states the source (commonly the city's major airport, e.g. LaGuardia for NYC, reported via NWS/Weather Underground climate reports). The reported max is an integer; a bucket "84-85°F" wins iff the official max is 84 or 85.

Event slugs follow `highest-temperature-in-{city}-on-{month}-{day}` (e.g. `highest-temperature-in-nyc-on-july-4`), which is what `weather-strategy.js` constructs. If Polymarket changes the pattern, update `slugPrefix` in config.

### ⚠️ The station is everything

A forecast for Central Park vs LaGuardia can differ by 2–4°F on a sea-breeze day — more than the bucket width. Before enabling a city:

1. Read the market description's resolution source.
2. Set `lat`/`lon` to **the station's coordinates** (the airport, not the city center).
3. Set `obsStation` to the station's ICAO code (US only — enables the same-day observation clamp).
4. Set `"verified": true`.

## The probability model

### Ensemble → bucket distribution

`weather-strategy.js` queries the Open-Meteo ensemble API (free, no key):

```
https://ensemble-api.open-meteo.com/v1/ensemble
  ?latitude=..&longitude=..&hourly=temperature_2m
  &models=gfs_seamless,ecmwf_ifs025
  &temperature_unit=fahrenheit&timezone={marketTz}
```

That returns ~30 GFS members + ~50 ECMWF members. For the target date (in the market's local timezone) each member's hourly series is reduced to its daily max. The model probability of a bucket is the fraction of members whose rounded max lands in it, with Laplace smoothing (α = 0.5) so no bucket is ever priced at exactly 0% or 100%:

```
P(bucket) = (members_in_bucket + 0.5) / (N + 0.5 × num_buckets)
```

Known bias to respect: hourly ensemble maxes read slightly **cool** vs official station maxes (hourly sampling misses the true peak, and grid cells smooth extremes). The smoothing plus the `minEdge` threshold absorbs most of this; if a verified city consistently misses low, add a per-city calibration offset before trusting bigger sizes.

### Same-day observation clamp (the strongest edge)

For today's market, the script pulls the last ~100 observations from `api.weather.gov/stations/{obsStation}/observations` and computes the **running max so far** (converted °C→°F). Every ensemble member below that value is raised to it — the day's max cannot be lower than what already happened.

By mid-afternoon this often makes one or two buckets near-certain while the market still prices them in the 60–80¢ range. This is where most of the weather P&L comes from. That's why the cron schedule includes afternoon and evening passes.

### Edge rule

For each bucket:

```
YES edge = P_model(bucket) − price_yes        → buy YES if ≥ minEdge
NO  edge = price_yes − P_model(bucket)        → buy NO  if ≥ minEdge
```

subject to: price paid ∈ (3¢, maxPrice], win probability ≥ `minModelProb`, per-city and per-day caps not exhausted. Only the **single best-edge bucket per event** is bet — buckets in one event are correlated, so betting several is just re-betting the same opinion with more fees.

### Sizing

Flat `betSize` (default $10). At a true 12-point edge on a 50¢ bucket, EV ≈ +$2.40 per $10 bet. Kelly would allow far more, but model probabilities are only approximately calibrated — flat small stakes until 50+ resolved bets prove the edge, then consider quarter-Kelly at most.

## Worked example

NYC, July 4, 2:30 PM ET pass:

```
Observed running max (KLGA): 86.2°F        ← 83-or-below and 84-85 are dead
Ensemble (78 members, clamped): median 88, range 86–91
   86-87°F: 22/78 → 29%     market: 45%    → NO edge +16 ✅
   88-89°F: 41/78 → 52%     market: 38%    → YES edge +14 ✅
   90°F+:   15/78 → 19%     market: 15%    → +4, no bet
Best edge: NO on 86-87°F @ 55¢ ... but YES 88-89 has cleaner win-prob → script picks +16 NO
→ one $10 bet placed, logged, redeemed automatically after the daily climate report resolves.
```

## Failure modes to expect

| Failure | Mitigation |
|---------|------------|
| Wrong station configured | `verified` flag + manual check; the biggest possible leak |
| Thin books / wide spreads | `outcomePrices` can be stale; maxPrice cap + small size; slippage via Bankr market orders eats ~1-3¢ |
| Ensemble API down/partial | `minEnsembleMembers` guard skips the cycle |
| NWS obs lag (up to 1h) | clamp only raises members, never lowers — degrades to pure-forecast mode |
| Rounding disputes (85.5°F) | official climate report integer is authoritative; buckets adjacent to the median are where losses concentrate — that's priced into minEdge |
| DST / timezone bugs | all date math uses the market's IANA tz (`marketTz`) end to end |
| Slug pattern changes | discovery logs "no open market found" — check Polymarket, update `slugPrefix` |

## Tuning

- `minEdge` 0.12 default. Raise to 0.15–0.20 if early results are break-even (model probably miscalibrated for that city). Don't go below 0.10 — Bankr slippage plus the cool bias eats it.
- `maxEdge` 0.35 default — the too-good-to-be-true guard. When a confident market disagrees with the ensemble by 40+ points, the overwhelmingly likely explanations are on our side: wrong resolution station, stale `outcomePrices` on a thin book, a bucket parse bug, or model bias — not free money. Suspect edges are never traded; shadow mode logs them with a `suspect-edge` flag so you can diagnose which side was right. If suspects consistently resolve in the model's favor for a verified city, raise `maxEdge` for that deployment.
- `maxDaysAhead` 1 default. Day-after-tomorrow ensembles are too wide to beat the market; don't raise it.
- Add cities one at a time, verified, and give each 20+ resolved bets before judging.
- Log everything; `pnl.js` breaks out weather vs btc so a leak in one machine can't hide behind the other.
