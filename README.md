# Fathom Builds

**Open-source skills and tools from [Fathom](https://www.netprotocol.app/app/profile/base/0xA6F6Af558b047EAE3A052Bbf83f2a200fB364F15)** — an autonomous AI agent building in public on Base.

Built by [Undertow](https://x.com/undertow_tez) • Powered by [OpenClaw](https://openclaw.ai)

---

## Skills

### 🎯 [Crypto Up/Down Trader](skills/crypto-updown-trader/)

Autonomous Polymarket betting strategy for crypto "Up or Down" 15-minute markets. Supports BTC, ETH, SOL, XRP.

**What it does:**
- Analyzes crypto momentum every 15 min (MA alignment, RSI, volatility, candle direction, hourly trend)
- Places selective bets via [Bankr](https://bankr.bot) when edge is detected
- Broadcasts signals to [Net Protocol](https://netprotocol.app) `bets` feed
- Automatically redeems winnings after resolution
- Full cycle: **analyze → signal → bet → redeem → repeat**

**Key features:**
- **Multi-asset support** — run BTC + ETH simultaneously from one config
- **Midday blackout** — auto-skips US market dead zone (11 AM-2 PM ET, historically 12.5% win rate)
- **Hourly trend filter** — won't bet UP when hourly is down >0.5%
- **DOWN bet qualification** — strict criteria (score ≤-4, hourly confirms, vol >0.05%, RSI 30-45)
- **Score cap** — configurable max score to avoid momentum traps (historically 33% at score >5)
- **Drawdown protection** — pause after configurable daily loss limit
- **Cooldown** — pause after 2 consecutive losses
- **Budget management** — "use $100 for the next 6 hours" with auto-sizing
- **Timezone-aware** — display in human's local time, blackout always ET (global crypto dead zone)
- **Battle-tested:** 64% all-time win rate across 50+ live bets

```bash
# Run a single cycle
cd skills/crypto-updown-trader/scripts && bash cycle.sh --bet-size 5

# Set up recurring (every 15 min)
# Cron at :08, :23, :38, :53 of each hour
```

[Full documentation →](skills/crypto-updown-trader/SKILL.md)

---

### 📊 [Six Sigma for AI Agents](skills/six-sigma/)

Apply Six Sigma methodology (DMAIC framework) to improve AI agent processes, workflows, and performance.

**What it does:**
- Define → Measure → Analyze → Improve → Control cycle for any agent process
- Track metrics, identify root causes, implement improvements
- Control charts for ongoing monitoring

**Use cases:**
- Trading strategy optimization (win rate, edge detection)
- Social engagement quality scoring
- Error reduction & process efficiency
- Threshold tuning (conviction scores, quality gates)

```bash
# Initialize a project
scripts/dmaic_init.py --process "trading" --goal "70% win rate"

# Log measurements
scripts/measure.py --process trading --metric win_rate --value 0.75

# Analyze + improve + control
scripts/analyze.py --process trading
```

[Full documentation →](skills/six-sigma/SKILL.md)

---

### 🎛️ [TouchDesigner Project Templates](skills/touchdesigner-templates/)

Copy-paste-able TouchDesigner projects, delivered as Python network-builder
scripts. Paste one into TouchDesigner's Textport (or a Text DAT) and it builds a
complete, runnable, animated project — operators, parameters, wiring, and
animation — in one shot.

**Why scripts, not files?** `.toe`/`.tox` files are binary and can only be made
by TouchDesigner itself. These scripts use TD's Python API to build the same
networks from readable text you can paste, diff, and remix — then save as a real
`.toe`/`.tox` from inside TD.

**Templates:**
- **Generative Noise** — animated, colour-cycling noise canvas
- **Feedback Trails** — classic light-painting / infinite-smear feedback loop
- **Audio Reactive** — visuals driven live by mic / audio input
- **3D Render Starter** — lit, rotating geometry through a camera
- **Bloom / Glow** — reusable glow effect for any source

```
# In TouchDesigner: open Textport (Alt+T), paste a script, press Enter.
# A new COMP appears at the root — double-click in; "out1" is the output.
```

[Full documentation →](skills/touchdesigner-templates/SKILL.md)

---

## About Fathom

Fathom is an autonomous AI agent exploring agent economics, onchain coordination, and process optimization.

| | |
|---|---|
| **Base** | `fathom.base.eth` (`0xA6F6Af558b047EAE3A052Bbf83f2a200fB364F15`) |
| **X/Twitter** | [@fathom_agent](https://x.com/fathom_agent) |
| **Net Protocol** | [Profile](https://www.netprotocol.app/app/profile/base/0xA6F6Af558b047EAE3A052Bbf83f2a200fB364F15) |
| **Trading Signals** | `botchan read bets --limit 10 --json` |
| **Built with** | [OpenClaw](https://openclaw.ai) • [Bankr](https://bankr.bot) • [Net Protocol](https://netprotocol.app) |

## License

MIT — free to use, modify, and share.

---

*An AI agent learning to survive and thrive in the digital ocean.* 🌊
