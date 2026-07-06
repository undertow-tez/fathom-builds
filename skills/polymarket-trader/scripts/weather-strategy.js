#!/usr/bin/env node
/**
 * Polymarket weather (highest-temperature) strategy.
 *
 * Edge: Polymarket temperature buckets are priced by retail flow; weather model
 * ensembles are a better probability estimate — especially <36h out, and
 * especially late in the target day when the running observed max makes low
 * buckets impossible.
 *
 * Pipeline per configured city:
 *   1. Discover markets by slug math: {slugPrefix}-on-{month}-{day} for today
 *      and the next maxDaysAhead days (fallback: scan the weather tag).
 *   2. Parse each bucket from groupItemTitle/question ("84-85°F", "88°F or above", ...).
 *   3. Build a probability distribution over buckets from the Open-Meteo
 *      ensemble (every member's daily max for the target date, in market tz).
 *   4. Same-day only: clamp members below the observed running max (NWS obs).
 *   5. Compare model probability vs market price; emit YES/NO recommendations
 *      where edge ≥ minEdge, respecting price bounds and per-day caps.
 *
 * Output: human-readable table + one machine line:
 *   __WEATHER_BETS__:[{slug, question, side, outcomeIndex, price, modelProb, edge, amount, city}, ...]
 *
 * This script only ANALYZES. weather-cycle.sh places the bets.
 *
 * Usage: node weather-strategy.js [--config path] [--city nyc] [--json]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}

const CONFIG_PATH = argVal('--config', path.join(__dirname, '..', 'config.json'));
const ONLY_CITY = argVal('--city', null);
// Shadow mode passes --bets-file shadow.jsonl so per-day caps apply to shadowed bets too
const BETS_FILE = argVal('--bets-file', path.join(__dirname, 'bets.jsonl'));

let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {
  console.error(`❌ Cannot read config at ${CONFIG_PATH} — copy config.example.json to config.json first`);
  process.exit(1);
}
const W = config.weather || {};
const CITIES = W.cities || {};
const MIN_EDGE = W.minEdge ?? 0.12;
// Edges beyond this are almost always OUR mistake (wrong station, stale quote,
// parse error, model bias) rather than free money — flag as suspect, don't trade.
const MAX_EDGE = W.maxEdge ?? 0.35;
const MAX_PRICE = W.maxPrice ?? 0.85;
const MIN_MODEL_PROB = W.minModelProb ?? 0.25;
const SIDES = W.sides || ['YES', 'NO'];
const BET_SIZE = W.betSize ?? 10;
const MAX_DAYS_AHEAD = W.maxDaysAhead ?? 1;
const MIN_MEMBERS = W.minEnsembleMembers ?? 15;
const MAX_PER_CITY = W.maxBetsPerCityPerDay ?? 1;
const MAX_PER_DAY = W.maxBetsPerDay ?? 4;

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

async function fetchJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'polymarket-trader/1.0 (weather)', ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Date helpers in a given IANA timezone
function tzDateParts(tz, d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, day] = fmt.format(d).split('-').map(Number);
  return { y, m, day, iso: fmt.format(d) };
}
function addDays(parts, n) {
  const d = new Date(Date.UTC(parts.y, parts.m - 1, parts.day + n, 12));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(),
           iso: d.toISOString().slice(0, 10) };
}

// ── Market discovery ──────────────────────────────────────────────────────────
async function findEvent(cityKey, city, dateParts) {
  const base = `${city.slugPrefix}-on-${MONTHS[dateParts.m - 1]}-${dateParts.day}`;
  // Current pattern includes the year; pre-2026 events used the bare form.
  for (const slug of [`${base}-${dateParts.y}`, base]) {
    try {
      const events = await fetchJSON(`https://gamma-api.polymarket.com/events?slug=${slug}`);
      if (Array.isArray(events) && events[0] && !events[0].closed) return { ...events[0], _slug: slug };
    } catch { /* try next form */ }
  }
  return null;
}

// ── Bucket parsing ────────────────────────────────────────────────────────────
// Handles: "84-85°F", "84–85°F", "88°F or above/higher/more", "83°F or below/lower/less",
// and Celsius equivalents. Returns {lo, hi} inclusive integer range (±Infinity open ends).
function parseBucket(label) {
  if (!label) return null;
  const s = label.replace(/[°]/g, '').trim();
  let m = s.match(/(-?\d+)\s*[-–—]\s*(-?\d+)/);
  if (m) return { lo: +m[1], hi: +m[2] };
  m = s.match(/(-?\d+)\s*[FC]?\s*(or above|or higher|or more|\+)/i);
  if (m) return { lo: +m[1], hi: Infinity };
  m = s.match(/(-?\d+)\s*[FC]?\s*(or below|or lower|or less)/i);
  if (m) return { lo: -Infinity, hi: +m[1] };
  m = s.match(/(above|higher than|greater than)\s*(-?\d+)/i);
  if (m) return { lo: +m[2] + 1, hi: Infinity };
  m = s.match(/(below|lower than|less than)\s*(-?\d+)/i);
  if (m) return { lo: -Infinity, hi: +m[2] - 1 };
  m = s.match(/^(-?\d+)\s*[FC]?$/i); // single-degree bucket, e.g. "30°C" (Celsius cities)
  if (m) return { lo: +m[1], hi: +m[1] };
  return null;
}

// ── Forecast: Open-Meteo ensemble ─────────────────────────────────────────────
const ensembleCache = {};
async function getEnsembleMaxes(city, targetDateIso) {
  const key = `${city.lat},${city.lon},${city.unit}`;
  if (!ensembleCache[key]) {
    const unit = city.unit === 'C' ? 'celsius' : 'fahrenheit';
    const url = `https://ensemble-api.open-meteo.com/v1/ensemble` +
      `?latitude=${city.lat}&longitude=${city.lon}` +
      `&hourly=temperature_2m&models=gfs_seamless,ecmwf_ifs025` +
      `&forecast_days=${MAX_DAYS_AHEAD + 2}&temperature_unit=${unit}` +
      `&timezone=${encodeURIComponent(city.marketTz)}`;
    ensembleCache[key] = await fetchJSON(url);
  }
  const hourly = ensembleCache[key].hourly || {};
  const times = hourly.time || [];
  const idx = times.map((t, i) => [t, i]).filter(([t]) => t.startsWith(targetDateIso)).map(([, i]) => i);
  if (!idx.length) return [];

  const maxes = [];
  for (const [k, series] of Object.entries(hourly)) {
    if (!k.startsWith('temperature_2m') || !Array.isArray(series)) continue;
    const vals = idx.map(i => series[i]).filter(v => v !== null && v !== undefined);
    if (vals.length >= idx.length * 0.75) maxes.push(Math.max(...vals));
  }
  return maxes;
}

// ── Same-day observed running max (NWS, US stations only) ────────────────────
async function getObservedMax(city, targetDateIso) {
  if (!city.obsStation) return null;
  try {
    const data = await fetchJSON(
      `https://api.weather.gov/stations/${city.obsStation}/observations?limit=100`,
      { Accept: 'application/geo+json' }
    );
    let max = null;
    for (const f of data.features || []) {
      const p = f.properties || {};
      const local = new Date(p.timestamp).toLocaleDateString('en-CA', { timeZone: city.marketTz });
      if (local !== targetDateIso) continue;
      let t = p.temperature?.value;
      if (t === null || t === undefined) continue;
      if (city.unit === 'F') t = t * 9 / 5 + 32; // NWS reports °C
      if (max === null || t > max) max = t;
    }
    return max;
  } catch (e) {
    console.log(`   ⚠️  NWS obs unavailable for ${city.obsStation}: ${e.message}`);
    return null;
  }
}

// ── Probability model ─────────────────────────────────────────────────────────
function bucketProbs(memberMaxes, buckets, observedMax) {
  // Clamp: the day's max can't end below what's already been observed
  const maxes = observedMax === null
    ? memberMaxes
    : memberMaxes.map(m => Math.max(m, observedMax));
  const n = maxes.length;
  const alpha = 0.5; // Laplace smoothing — never claim 0% or 100%
  return buckets.map(b => {
    const count = maxes.filter(m => {
      const r = Math.round(m);
      return r >= b.lo && r <= b.hi;
    }).length;
    return (count + alpha) / (n + alpha * buckets.length);
  });
}

// ── Per-day bet caps from bets.jsonl ─────────────────────────────────────────
function todaysWeatherBets() {
  const today = new Date().toISOString().slice(0, 10);
  const byCity = {};
  let total = 0;
  try {
    for (const line of fs.readFileSync(BETS_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      if (d.strategy !== 'weather' || !['submitted', 'shadow'].includes(d.result)) continue;
      if (!String(d.time || '').startsWith(today)) continue;
      total++;
      const c = d.meta?.city || '?';
      byCity[c] = (byCity[c] || 0) + 1;
    }
  } catch { /* no bets file yet */ }
  return { total, byCity };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const recommendations = [];
  const placed = todaysWeatherBets();
  let budgetLeft = MAX_PER_DAY - placed.total;

  for (const [cityKey, city] of Object.entries(CITIES)) {
    if (ONLY_CITY && cityKey !== ONLY_CITY) continue;
    if ((placed.byCity[cityKey] || 0) >= MAX_PER_CITY) {
      console.log(`⏸️  ${cityKey}: already at ${MAX_PER_CITY} bet(s) today — skipping`);
      continue;
    }
    console.log(`\n🌡️  ${cityKey.toUpperCase()} (${city.slugPrefix}, unit °${city.unit})`);
    if (city.verified === false) {
      console.log(`   ⚠️  City not marked verified — confirm the market's resolution station matches obsStation/lat/lon (see SKILL.md), then set "verified": true`);
    }

    const today = tzDateParts(city.marketTz);
    for (let offset = 0; offset <= MAX_DAYS_AHEAD; offset++) {
      const target = offset === 0 ? today : addDays(today, offset);
      const event = await findEvent(cityKey, city, target);
      if (!event) { console.log(`   ${target.iso}: no open market found`); continue; }
      console.log(`   📋 Event: ${event.title || event._slug} (${target.iso})`);

      const markets = (event.markets || []).map(m => {
        const bucket = parseBucket(m.groupItemTitle || m.question);
        let prices = [];
        try { prices = JSON.parse(m.outcomePrices || '[]').map(Number); } catch {}
        return { m, bucket, yesPrice: prices[0] ?? null };
      }).filter(x => x.bucket && x.yesPrice !== null && !x.m.closed);

      if (!markets.length) { console.log('   ⚠️  No parseable open buckets'); continue; }

      const memberMaxes = await getEnsembleMaxes(city, target.iso);
      if (memberMaxes.length < MIN_MEMBERS) {
        console.log(`   ⚠️  Only ${memberMaxes.length} ensemble members (< ${MIN_MEMBERS}) — skipping`);
        continue;
      }
      const observedMax = offset === 0 ? await getObservedMax(city, target.iso) : null;
      const sorted = [...memberMaxes].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      console.log(`   🌤️  Ensemble: ${memberMaxes.length} members, median max ${med.toFixed(1)}°${city.unit}, range ${sorted[0].toFixed(1)}–${sorted[sorted.length - 1].toFixed(1)}`);
      if (observedMax !== null) console.log(`   🌡️  Observed running max today: ${observedMax.toFixed(1)}°${city.unit}`);

      const probs = bucketProbs(memberMaxes, markets.map(x => x.bucket), observedMax);

      let best = null;
      markets.forEach((x, i) => {
        const modelProb = probs[i];
        const yes = x.yesPrice;
        const label = x.m.groupItemTitle || x.m.question;
        const yesEdge = modelProb - yes;
        const noEdge = yes - modelProb; // buying NO at (1 - yes)
        console.log(`      ${String(label).padEnd(18)} market ${(yes * 100).toFixed(0).padStart(3)}% | model ${(modelProb * 100).toFixed(0).padStart(3)}% | edge ${yesEdge >= 0 ? '+' : ''}${(yesEdge * 100).toFixed(0)}`);

        for (const side of SIDES) {
          const edge = side === 'YES' ? yesEdge : noEdge;
          const price = side === 'YES' ? yes : 1 - yes;
          const winProb = side === 'YES' ? modelProb : 1 - modelProb;
          if (edge < MIN_EDGE) continue;
          if (price <= 0.03 || price > MAX_PRICE) continue;   // avoid dust and near-certainties
          if (winProb < MIN_MODEL_PROB) continue;
          if (!best || edge > best.edge) {
            best = {
              city: cityKey, date: target.iso,
              slug: x.m.slug, question: x.m.question,
              side, outcomeIndex: side === 'YES' ? 0 : 1,
              price: +price.toFixed(3), modelProb: +winProb.toFixed(3), edge: +edge.toFixed(3),
              amount: BET_SIZE,
              suspect: edge > MAX_EDGE,
            };
          }
        }
      });

      if (best && budgetLeft > 0) {
        recommendations.push(best);
        budgetLeft--;
        if (best.suspect) {
          console.log(`   🚩 SUSPECT EDGE (+${(best.edge * 100).toFixed(0)} > maxEdge ${(MAX_EDGE * 100).toFixed(0)}): ${best.side} "${best.question}" — a confident market disagreeing this hard usually means OUR config/model is wrong. Not tradeable; shadow-logged for diagnosis.`);
        } else {
          console.log(`   ✅ RECOMMEND: ${best.side} "${best.question}" @ ${(best.price * 100).toFixed(0)}¢ (model ${(best.modelProb * 100).toFixed(0)}%, edge +${(best.edge * 100).toFixed(0)})`);
        }
        break; // one bet per city per run — next city
      } else if (best) {
        console.log(`   ⏸️  Edge found but daily cap (${MAX_PER_DAY}) reached`);
      } else {
        console.log(`   ⏸️  No bucket clears minEdge ${(MIN_EDGE * 100).toFixed(0)} pts — market agrees with the models`);
      }
    }
  }

  console.log(`\n__WEATHER_BETS__:${JSON.stringify(recommendations)}`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
}

module.exports = { parseBucket, bucketProbs };
