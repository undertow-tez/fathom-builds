# Six Sigma Metrics for AI Agents

## Core Metrics

### Defect Rate
**Definition**: Errors or failures per 100 operations

**Formula**: `(Defects / Total Opportunities) × 100`

**Example**: 
- 6 failed trades out of 30 attempts = (6/30) × 100 = 20% defect rate

**When to use**: Tracking errors, failed transactions, incorrect outputs

**Target**: <3.4 defects per 100 (Six Sigma standard)

### Cycle Time
**Definition**: Time from start to completion of a process

**Formula**: `End Time - Start Time`

**Example**:
- Weather bet decision: 45 seconds from signal to execution
- Social post: 12 seconds from idea to published

**When to use**: Optimizing speed, identifying bottlenecks

**Target**: Minimize without sacrificing quality

### Throughput
**Definition**: Number of completed operations per time unit

**Formula**: `Completed Operations / Time Period`

**Example**:
- 15 alpha signals processed per hour
- 8 quality social posts per day

**When to use**: Measuring productivity, capacity planning

**Target**: Maximize while maintaining quality

### First-Time Yield (FTY)
**Definition**: Percentage of operations completed correctly on first attempt

**Formula**: `(Successful First Attempts / Total Attempts) × 100`

**Example**:
- 7 trades executed correctly without retry out of 10 = 70% FTY

**When to use**: Measuring process quality, reducing rework

**Target**: >95%

### Process Capability (Sigma Level)
**Definition**: How well a process meets specifications

**Calculation**:
1. Calculate mean and standard deviation
2. Determine upper/lower spec limits
3. Sigma level = (Spec Limit - Mean) / Std Dev

**Sigma Levels**:
- 1σ = 68.3% within spec (31.7% defects)
- 2σ = 95.4% within spec (4.6% defects)
- 3σ = 99.7% within spec (0.3% defects)
- 6σ = 99.9997% within spec (0.0003% defects)

**Example**:
- Mean trading accuracy: 65%
- Std dev: 10%
- Target: >50% accuracy
- Sigma level = (65 - 50) / 10 = 1.5σ

**When to use**: Assessing overall process maturity

**Target**: 3σ or higher (99.7% quality)

## AI Agent-Specific Metrics

### Conviction Accuracy
**Definition**: How often high-conviction predictions are correct

**Formula**: `(Correct High-Conviction Calls / Total High-Conviction Calls) × 100`

**Example**:
- 8 conviction ≥6/10 signals, 6 were profitable = 75% accuracy

**Tracking**: Log conviction score + outcome for each decision

### Response Quality Score
**Definition**: Subjective quality rating of agent outputs

**Scale**: 1-10 (1=spam, 10=exceptional value)

**Factors**:
- Relevance (does it answer the question?)
- Accuracy (is the information correct?)
- Engagement (does it spark discussion?)
- Originality (is it insightful?)

**Example**:
- Generic "gm" reply: 2/10
- Thoughtful analysis with data: 8/10

**Tracking**: Score each output, track distribution

### False Positive/Negative Rate
**Definition**: Incorrect signals in decision-making

**False Positive**: Signal fires when it shouldn't (e.g., bad trade signal)
**False Negative**: Signal misses when it should fire (e.g., missed opportunity)

**Formula**: 
- FP Rate = (False Positives / Total Negatives) × 100
- FN Rate = (False Negatives / Total Positives) × 100

**Example**:
- 20 bet signals generated
- 12 were profitable (true positives)
- 8 were losers (false positives)
- 5 opportunities missed (false negatives)
- FP Rate = (8/25) × 100 = 32%
- FN Rate = (5/17) × 100 = 29%

**When to use**: Optimizing signal thresholds, reducing noise

### Token Efficiency
**Definition**: Value per token consumed

**Formula**: `Output Value / Tokens Used`

**Example**:
- Generated $10 profit using 50k tokens = $0.0002/token
- Wrote useful skill using 100k tokens = subjective value

**When to use**: Optimizing context window usage, model selection

**Tracking**: Log token usage + outcome value

## Measurement Best Practices

1. **Consistency** - Measure the same way every time
2. **Frequency** - Measure every occurrence (not samples)
3. **Context** - Log relevant contextual factors
4. **Timeliness** - Record immediately (not from memory)
5. **Automation** - Script measurement where possible

## Data Collection Tips

**Use JSONL format** for time-series data:
```json
{"timestamp":"2026-02-11T12:00:00Z","metric":"accuracy","value":0.75,"context":"morning"}
{"timestamp":"2026-02-11T18:00:00Z","metric":"accuracy","value":0.60,"context":"evening"}
```

**Benefits**:
- Append-only (no rewrites)
- Line-by-line parsing
- Easy filtering
- Standard format

**Storage**:
```
~/.openclaw/workspace/six-sigma-projects/<process>/measurements.jsonl
```

## Common Pitfalls

1. **Measuring vanity metrics** - Track what matters, not what looks good
2. **Inconsistent definitions** - Define metrics once, follow strictly
3. **Too many metrics** - Start with 2-3 key metrics
4. **No baseline** - Record current state before improving
5. **Ignoring context** - Log environmental factors affecting performance
