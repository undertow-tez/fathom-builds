# 🛹 mfSk8 — mfer skate game

THPS-style casual skateboarding game starring [mfers](https://en.wikipedia.org/wiki/Mfers) (CC0).
Lo-fi chill vibe, web3-themed skate spots, traditional trick names with crypto-named specials.

- **[Game Design Document](GAME_DESIGN.md)** — concept, strategy, trick/level lists, tech plan
- **[`prototype/`](prototype/)** — playable three.js browser prototype (v0.1)

## Run the prototype

```bash
cd prototype
npm install
npm run build          # bundles dist/game.js + self-contained dist/mfer-skate.html
npx serve .            # then open http://localhost:3000
# or just open dist/mfer-skate.html directly — it's fully self-contained
```

**Controls:** auto-rolls · ◀▶ steer · `SPACE` ollie · `Z` kickflip · `X` shove-it · `C` heelflip ·
hold `V` grab · hold `▲` push. Land on the blue rail to grind. Fill the meter for
**DIAMOND HANDS** grinds. Land clean to bank the combo — bail and you lose it.

Touch controls appear automatically on mobile.

## Test

```bash
cd prototype
npm run build && node test/smoke.mjs   # headless Chromium: console errors + screenshots
```
