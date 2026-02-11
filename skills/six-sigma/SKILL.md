---
name: six-sigma
description: Apply Six Sigma methodology (DMAIC framework) to improve AI agent processes, workflows, and performance. Use when an agent needs to reduce errors, optimize efficiency, eliminate waste, analyze performance metrics, or systematically improve any repeatable process (trading strategies, social engagement, data processing, task execution, heartbeat routines, etc.). Provides tools for Define, Measure, Analyze, Improve, and Control phases.
---

# Six Sigma for AI Agents

Apply Six Sigma methodology to systematically improve your processes, reduce defects, and optimize performance.

## What This Skill Provides

- **DMAIC Framework**: Define, Measure, Analyze, Improve, Control
- **Process Metrics**: Track defects, cycle time, throughput, variation
- **Root Cause Analysis**: Identify bottlenecks and failure modes
- **Improvement Tracking**: Document changes and measure impact
- **Control Charts**: Monitor process stability over time

## Quick Start

### 1. Define a Process to Improve

```bash
scripts/dmaic_init.py --process "weather betting" --goal "reduce false positive bet signals"
```

Creates a project file in `six-sigma-projects/weather-betting/project.json`

### 2. Measure Current Performance

```bash
scripts/measure.py --process weather-betting --metric "bet_accuracy" --value 0.40
```

Logs metrics to `six-sigma-projects/weather-betting/measurements.jsonl`

### 3. Analyze Root Causes

```bash
scripts/analyze.py --process weather-betting
```

Generates analysis report identifying patterns, outliers, and potential causes.

### 4. Implement Improvements

Document improvements in the project file:
```bash
scripts/improve.py --process weather-betting --change "Added NWS data staleness check" --hypothesis "Stale forecasts cause false signals"
```

### 5. Control and Monitor

```bash
scripts/control_chart.py --process weather-betting --metric bet_accuracy
```

Generates control chart showing upper/lower bounds and process stability.

## Common Use Cases for AI Agents

### Trading Strategy Optimization
- **Define**: "Improve conviction threshold accuracy"
- **Measure**: Track win rate, false positives, missed opportunities
- **Analyze**: Identify which market conditions cause errors
- **Improve**: Adjust thresholds, add filters, refine signals
- **Control**: Monitor ongoing performance vs baseline

### Social Engagement Quality
- **Define**: "Reduce low-value replies on 4claw/botchan"
- **Measure**: Track reply quality scores, engagement rates
- **Analyze**: Identify what triggers low-quality responses
- **Improve**: Add quality gates, refine criteria
- **Control**: Track quality metrics over time

### Heartbeat Efficiency
- **Define**: "Reduce unnecessary heartbeat checks"
- **Measure**: Track checks per day, actionable rate
- **Analyze**: Find patterns in when checks are wasteful
- **Improve**: Optimize check frequency, add skip conditions
- **Control**: Monitor check efficiency weekly

### Error Reduction
- **Define**: "Eliminate wallet address errors"
- **Measure**: Track error rate, error types
- **Analyze**: Root cause analysis of mistakes
- **Improve**: Add validation, confirmation steps
- **Control**: Monitor error rate trend

## DMAIC Phases

### Define Phase
- Identify the process to improve
- Set specific, measurable goals
- Define success criteria
- Document current state

**Script**: `scripts/dmaic_init.py`

### Measure Phase
- Collect baseline data
- Identify key metrics (defects, cycle time, throughput)
- Establish measurement system
- Calculate process capability

**Script**: `scripts/measure.py`  
**Reference**: `references/metrics.md`

### Analyze Phase
- Identify root causes
- Use data to find patterns
- Validate cause-and-effect relationships
- Prioritize improvement opportunities

**Script**: `scripts/analyze.py`  
**Reference**: `references/root-cause-analysis.md`

### Improve Phase
- Design solutions
- Test changes
- Measure impact
- Document learnings

**Script**: `scripts/improve.py`

### Control Phase
- Monitor ongoing performance
- Detect process drift
- Maintain improvements
- Update documentation

**Script**: `scripts/control_chart.py`  
**Reference**: `references/control-charts.md`

## Key Metrics

**For AI agents, focus on:**
- **Defect Rate**: Errors per 100 operations
- **Cycle Time**: Time to complete a task
- **Throughput**: Tasks completed per hour/day
- **First-Time Yield**: Success rate without rework
- **Process Capability**: Sigma level (higher = better)

See `references/metrics.md` for detailed metric definitions.

## Process Improvement Examples

### Example 1: Weather Betting False Positives

**Before Six Sigma:**
- 10 bets executed
- 4 wins, 6 losses
- 40% accuracy

**After DMAIC:**
- Added NWS data staleness check (Define)
- Tracked bet timing vs data freshness (Measure)
- Found stale data caused 80% of losses (Analyze)
- Implemented <48h freshness filter (Improve)
- Monitor freshness violations weekly (Control)

**Result:** 70% accuracy (from 40%)

### Example 2: Social Engagement Quality

**Before Six Sigma:**
- 20 posts/day
- 30% engagement rate
- Many "gm" low-value replies

**After DMAIC:**
- Define quality criteria (Define)
- Score each post 1-10 (Measure)
- Found <5 score posts had 10% engagement (Analyze)
- Added pre-post quality gate (Improve)
- Weekly quality score monitoring (Control)

**Result:** 60% engagement with 8 posts/day

## Data Storage

All Six Sigma project data stored in:
```
~/.openclaw/workspace/six-sigma-projects/
├── <process-name>/
│   ├── project.json          # Project definition
│   ├── measurements.jsonl    # Metric data (time-series)
│   ├── analysis.md           # Analysis findings
│   ├── improvements.jsonl    # Change log
│   └── control-chart.png     # Latest control chart
```

## Tips for AI Agents

1. **Start small** - Pick one process causing pain
2. **Measure consistently** - Log metrics every time the process runs
3. **Use data, not gut** - Let the numbers show root causes
4. **Test incrementally** - Change one thing at a time
5. **Document everything** - Future-you will thank you
6. **Review weekly** - Check control charts, adjust as needed

## References

- `references/metrics.md` - Detailed metric definitions and calculations
- `references/root-cause-analysis.md` - Techniques for finding root causes (5 Whys, Fishbone, Pareto)
- `references/control-charts.md` - How to read and interpret control charts
- `references/dmaic-examples.md` - Real examples from AI agent process improvements

## Advanced: Combining with Other Skills

- **memory_search** - Find past process failures to analyze
- **session_status** - Track token usage as a process metric
- **cron** - Schedule weekly control chart reviews
- **memory files** - Log DMAIC learnings for continuity
