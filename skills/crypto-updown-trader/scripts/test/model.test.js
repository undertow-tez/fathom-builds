'use strict';
/**
 * Deterministic unit tests for the model core. No network, no files.
 * Run: node scripts/test/model.test.js
 */
const assert = require('assert');
const m = require('../lib/model');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed++;
}
function approx(name, a, b, tol = 1e-3) {
  assert.ok(Math.abs(a - b) <= tol, `${name}: ${a} !~= ${b}`);
  passed++;
}

// --- normalCDF sanity ---
approx('CDF(0)=0.5', m.normalCDF(0), 0.5);
approx('CDF(1.645)~0.95', m.normalCDF(1.645), 0.95, 2e-3);
approx('CDF(-1.645)~0.05', m.normalCDF(-1.645), 0.05, 2e-3);
ok('CDF monotone', m.normalCDF(1) > m.normalCDF(0.5));

// --- probUp ---
approx('at strike, mid time => ~0.5', m.probUp(100, 100, 0.001, 5), 0.5, 1e-6);
ok('above strike => >0.5', m.probUp(100.5, 100, 0.001, 5) > 0.5);
ok('below strike => <0.5', m.probUp(99.5, 100, 0.001, 5) < 0.5);
ok('less time => more certain (above)',
  m.probUp(100.5, 100, 0.001, 1) > m.probUp(100.5, 100, 0.001, 10));
ok('zero time above strike => 1', m.probUp(100.01, 100, 0.001, 0) === 1);
ok('zero time below strike => 0', m.probUp(99.99, 100, 0.001, 0) === 0);
ok('exact tie at expiry resolves UP => 1', m.probUp(100, 100, 0.001, 0) === 1);
ok('tieBias nudges up', m.probUp(100, 100, 0.001, 1, 0.1) > 0.5);
ok('prob bounded [0,1]', (() => { const p = m.probUp(200, 100, 0.05, 1); return p <= 1 && p >= 0; })());

// --- volPerMinute ---
(() => {
  // flat prices => zero vol
  const flat = Array.from({ length: 40 }, () => ({ close: 100 }));
  approx('flat => 0 vol', m.volPerMinute(flat), 0, 1e-9);
  // known alternating returns
  const c = [{ close: 100 }, { close: 101 }, { close: 100 }, { close: 101 }, { close: 100 }];
  ok('alternating => positive vol', m.volPerMinute(c) > 0);
})();

// --- evPerDollar ---
approx('EV fair coin at 0.5 => 0', m.evPerDollar(0.5, 0.5), 0);
ok('EV +when p>price', m.evPerDollar(0.6, 0.5) > 0);
ok('EV -when p<price', m.evPerDollar(0.4, 0.5) < 0);
approx('EV p=0.6 price=0.5 => 0.2', m.evPerDollar(0.6, 0.5), 0.2);

// --- kellyFraction ---
ok('kelly 0 when not +EV', m.kellyFraction(0.5, 0.5) === 0);
approx('kelly p=0.6 price=0.5 => 0.2', m.kellyFraction(0.6, 0.5), 0.2);
ok('kelly grows with edge', m.kellyFraction(0.7, 0.5) > m.kellyFraction(0.6, 0.5));

// --- decide ---
(() => {
  // Strong UP edge: spot well above strike, cheap UP price
  const d = m.decide(
    { spot: 100.4, strike: 100, sigmaPerMin: 0.0008, minutesLeft: 3, upPrice: 0.55, downPrice: 0.45 },
    { minEdge: 0.04, kellyFraction: 0.25, maxBetFraction: 0.02, bankroll: 100, tieBias: 0 }
  );
  ok('decide picks BET_UP on real edge', d.decision === 'BET_UP');
  ok('decide sizes positive', d.size > 0);
  ok('decide respects maxBetFraction cap', d.size <= 0.02 * 100 + 1e-9);
})();

(() => {
  // No edge: model ~ market
  const d = m.decide(
    { spot: 100, strike: 100, sigmaPerMin: 0.001, minutesLeft: 7, upPrice: 0.5, downPrice: 0.5 },
    { minEdge: 0.04 }
  );
  ok('decide NO_BET when no edge', d.decision === 'NO_BET');
})();

(() => {
  // Overpriced near-certainty gets filtered by maxPrice
  const d = m.decide(
    { spot: 101, strike: 100, sigmaPerMin: 0.0005, minutesLeft: 1, upPrice: 0.99, downPrice: 0.01 },
    { minEdge: 0.01, maxPrice: 0.97 }
  );
  ok('decide filters overpriced UP via maxPrice', d.decision === 'NO_BET');
})();

console.log(`\n✅ model.test.js — ${passed} assertions passed`);
