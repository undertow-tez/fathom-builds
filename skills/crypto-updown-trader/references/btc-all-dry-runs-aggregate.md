# BTC machine — aggregated dry-run history

This file aggregates the repo's historical BTC dry-run evidence from:

- `logs/machine.log`
- `runtime/state*.json` snapshots
- `runtime/analysis/dry-run-training.jsonl`

## Top-level totals

- Log lines parsed: **38793**
- Loop starts seen: **25**
- Meaningful sessions (sessions with skips, dry-runs, or settlements): **20**
- Dry-run placement events in log: **55**
- Unique dry-run market slugs: **52**
- Resolved unique dry-run trades: **37**
- Unresolved unique dry-run trades still lacking settlement in the log: **15**
- Win / loss: **17W / 20L**
- Win rate on resolved dry-runs: **45.9%**
- Realized P/L across resolved dry-runs: **$+17.9806**
- Avg modeled edge on resolved dry-runs: **0.1400**
- Avg estimated win probability on resolved dry-runs: **0.5682**
- Direction split (resolved): **up=25 / down=12**

## Cycle result counts from log

| Result | Count |
|---|---:|
| dry_run | 55 |
| noop | 37916 |
| skip | 548 |

## Most common skip / noop reasons

| Reason | Count |
|---|---:|
| market already processed | 26331 |
| blackout hour | 4859 |
| awaiting qualified entry candidate before band ends | 3811 |
| tracking best entry candidate | 2158 |
| waiting for next 15m block | 649 |
| no qualified entry candidate in entry band | 548 |
| outside entry window | 105 |
| live_mode=false | 55 |
| signal did not qualify | 3 |

## Session config eras seen in the log

| Config string from `Loop started` | Sessions |
|---|---:|
| `(live_mode=False)` | 1 |
| `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` | 10 |
| `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` | 9 |

## Resolved dry-run trade ledger

| Slug | Market | Dir | Entry px | Est win p | Edge | Status | P/L |
|---|---|---|---:|---:|---:|---|---:|
| `btc-updown-15m-1781866800` | Bitcoin Up or Down - June 19, 7:00AM-7:15AM ET | up | 0.5050 | 0.5911 | 0.0861 | lost | -5.0000 |
| `btc-updown-15m-1781869500` | Bitcoin Up or Down - June 19, 7:45AM-8:00AM ET | up | 0.4750 | 0.6114 | 0.1364 | lost | -5.0000 |
| `btc-updown-15m-1781870400` | Bitcoin Up or Down - June 19, 8:00AM-8:15AM ET | up | 0.5100 | 0.5664 | 0.0564 | lost | -5.0000 |
| `btc-updown-15m-1781892900` | Bitcoin Up or Down - June 19, 2:15PM-2:30PM ET | up | 0.4700 | 0.5916 | 0.1216 | lost | -5.0000 |
| `btc-updown-15m-1782110700` | Bitcoin Up or Down - June 22, 2:45AM-3:00AM ET | down | 0.4650 | 0.6504 | 0.1854 | won | 5.7527 |
| `btc-updown-15m-1782117900` | Bitcoin Up or Down - June 22, 4:45AM-5:00AM ET | down | 0.3850 | 0.6536 | 0.2686 | won | 7.9870 |
| `btc-updown-15m-1782128700` | Bitcoin Up or Down - June 22, 7:45AM-8:00AM ET | up | 0.4250 | 0.5900 | 0.1650 | won | 6.7647 |
| `btc-updown-15m-1782155700` | Bitcoin Up or Down - June 22, 3:15PM-3:30PM ET | down | 0.4750 | 0.5571 | 0.0821 | won | 5.5263 |
| `btc-updown-15m-1782170100` | Bitcoin Up or Down - June 22, 7:15PM-7:30PM ET | down | 0.4850 | 0.9253 | 0.4403 | lost | -5.0000 |
| `btc-updown-15m-1782178200` | Bitcoin Up or Down - June 22, 9:30PM-9:45PM ET | up | 0.4250 | 0.5068 | 0.0818 | lost | -5.0000 |
| `btc-updown-15m-1782186300` | Bitcoin Up or Down - June 22, 11:45PM-12:00AM ET | down | 0.4150 | 0.5432 | 0.1282 | lost | -5.0000 |
| `btc-updown-15m-1782189900` | Bitcoin Up or Down - June 23, 12:45AM-1:00AM ET | down | 0.3450 | 0.5022 | 0.1572 | won | 9.4928 |
| `btc-updown-15m-1782192600` | Bitcoin Up or Down - June 23, 1:30AM-1:45AM ET | down | 0.4250 | 0.5225 | 0.0975 | won | 6.7647 |
| `btc-updown-15m-1782195300` | Bitcoin Up or Down - June 23, 2:15AM-2:30AM ET | down | 0.3050 | 0.6825 | 0.3775 | won | 11.3934 |
| `btc-updown-15m-1782203400` | Bitcoin Up or Down - June 23, 4:30AM-4:45AM ET | down | 0.1850 | 0.2627 | 0.0777 | lost | -5.0000 |
| `btc-updown-15m-1782207000` | Bitcoin Up or Down - June 23, 5:30AM-5:45AM ET | up | 0.4950 | 0.5821 | 0.0871 | lost | -5.0000 |
| `btc-updown-15m-1782210600` | Bitcoin Up or Down - June 23, 6:30AM-6:45AM ET | down | 0.4700 | 0.7396 | 0.2696 | won | 5.6383 |
| `btc-updown-15m-1782223200` | Bitcoin Up or Down - June 23, 10:00AM-10:15AM ET | up | 0.4950 | 0.8144 | 0.3194 | won | 5.1010 |
| `btc-updown-15m-1782237600` | Bitcoin Up or Down - June 23, 2:00PM-2:15PM ET | down | 0.2850 | 0.4761 | 0.1911 | lost | -5.0000 |
| `btc-updown-15m-1782238500` | Bitcoin Up or Down - June 23, 2:15PM-2:30PM ET | down | 0.5550 | 0.6001 | 0.0451 | won | 4.0090 |
| `btc-updown-15m-1782292500` | Bitcoin Up or Down - June 24, 5:15AM-5:30AM ET | up | 0.5050 | 0.5451 | 0.0401 | lost | -2.0000 |
| `btc-updown-15m-1782305100` | Bitcoin Up or Down - June 24, 8:45AM-9:00AM ET | up | 0.3950 | 0.4834 | 0.0884 | lost | -2.0000 |
| `btc-updown-15m-1782333000` | Bitcoin Up or Down - June 24, 4:30PM-4:45PM ET | up | 0.4750 | 0.5197 | 0.0447 | won | 2.2105 |
| `btc-updown-15m-1782333900` | Bitcoin Up or Down - June 24, 4:45PM-5:00PM ET | up | 0.4550 | 0.5058 | 0.0508 | won | 2.3956 |
| `btc-updown-15m-1782993600` | Bitcoin Up or Down - July 2, 8:00AM-8:15AM ET | up | 0.3650 | 0.5483 | 0.1833 | lost | -2.0000 |
| `btc-updown-15m-1783000800` | Bitcoin Up or Down - July 2, 10:00AM-10:15AM ET | up | 0.4350 | 0.5382 | 0.1032 | won | 2.5977 |
| `btc-updown-15m-1783029600` | Bitcoin Up or Down - July 2, 6:00PM-6:15PM ET | up | 0.2150 | 0.4516 | 0.2366 | lost | -2.0000 |
| `btc-updown-15m-1783188900` | Bitcoin Up or Down - July 4, 2:15PM-2:30PM ET | up | 0.4850 | 0.5214 | 0.0364 | lost | -2.0000 |
| `btc-updown-15m-1783248300` | Bitcoin Up or Down - July 5, 6:45AM-7:00AM ET | up | 0.5050 | 0.5929 | 0.0879 | won | 1.9604 |
| `btc-updown-15m-1783256400` | Bitcoin Up or Down - July 5, 9:00AM-9:15AM ET | up | 0.4350 | 0.5710 | 0.1360 | lost | -2.0000 |
| `btc-updown-15m-1783260000` | Bitcoin Up or Down - July 5, 10:00AM-10:15AM ET | up | 0.4750 | 0.5891 | 0.1141 | lost | -2.0000 |
| `btc-updown-15m-1783278000` | Bitcoin Up or Down - July 5, 3:00PM-3:15PM ET | up | 0.3150 | 0.4780 | 0.1630 | won | 4.3492 |
| `btc-updown-15m-1783299600` | Bitcoin Up or Down - July 5, 9:00PM-9:15PM ET | up | 0.3250 | 0.4956 | 0.1706 | won | 4.1538 |
| `btc-updown-15m-1783300500` | Bitcoin Up or Down - July 5, 9:15PM-9:30PM ET | up | 0.3450 | 0.4606 | 0.1156 | lost | -2.0000 |
| `btc-updown-15m-1783301400` | Bitcoin Up or Down - July 5, 9:30PM-9:45PM ET | up | 0.4950 | 0.6129 | 0.1179 | lost | -2.0000 |
| `btc-updown-15m-1783338300` | Bitcoin Up or Down - July 6, 7:45AM-8:00AM ET | up | 0.5050 | 0.5642 | 0.0592 | lost | -2.0000 |
| `btc-updown-15m-1783347300` | Bitcoin Up or Down - July 6, 10:15AM-10:30AM ET | up | 0.5150 | 0.5749 | 0.0599 | won | 1.8835 |

## Unresolved dry-run trades still present in the log

| Slug | Market | Dir | Entry px | Est win p | Edge | Placement events | Placed at |
|---|---|---|---:|---:|---:|---:|---|
| `btc-updown-15m-1781834400` | Bitcoin Up or Down - June 18, 10:00PM-10:15PM ET | up | n/a | n/a | n/a | 1 | 2026-06-19T02:00:09.923225+00:00 |
| `btc-updown-15m-1781838900` | Bitcoin Up or Down - June 18, 11:15PM-11:30PM ET | down | 0.4650 | 0.6108 | 0.1458 | 1 | 2026-06-19T03:17:11.253167+00:00 |
| `btc-updown-15m-1781839800` | Bitcoin Up or Down - June 18, 11:30PM-11:45PM ET | up | 0.4250 | 0.5717 | 0.1467 | 1 | 2026-06-19T03:32:14.060461+00:00 |
| `btc-updown-15m-1781840700` | Bitcoin Up or Down - June 18, 11:45PM-12:00AM ET | down | 0.5450 | 0.6020 | 0.0570 | 1 | 2026-06-19T03:47:24.089310+00:00 |
| `btc-updown-15m-1781845200` | Bitcoin Up or Down - June 19, 1:00AM-1:15AM ET | down | 0.4450 | 0.5966 | 0.1516 | 1 | 2026-06-19T05:02:18.934558+00:00 |
| `btc-updown-15m-1781848800` | Bitcoin Up or Down - June 19, 2:00AM-2:15AM ET | up | 0.4950 | 0.5921 | 0.0971 | 1 | 2026-06-19T06:02:24.143166+00:00 |
| `btc-updown-15m-1781849700` | Bitcoin Up or Down - June 19, 2:15AM-2:30AM ET | up | 0.4750 | 0.6064 | 0.1314 | 1 | 2026-06-19T06:17:07.480200+00:00 |
| `btc-updown-15m-1781856000` | Bitcoin Up or Down - June 19, 4:00AM-4:15AM ET | up | 0.5250 | 0.5916 | 0.0666 | 1 | 2026-06-19T08:02:18.686737+00:00 |
| `btc-updown-15m-1781859600` | Bitcoin Up or Down - June 19, 5:00AM-5:15AM ET | down | 0.4250 | 0.6036 | 0.1786 | 1 | 2026-06-19T09:02:51.421293+00:00 |
| `btc-updown-15m-1781860500` | Bitcoin Up or Down - June 19, 5:15AM-5:30AM ET | down | 0.4450 | 0.6012 | 0.1562 | 1 | 2026-06-19T09:17:04.704398+00:00 |
| `btc-updown-15m-1781864100` | Bitcoin Up or Down - June 19, 6:15AM-6:30AM ET | up | 0.4850 | 0.5965 | 0.1115 | 1 | 2026-06-19T10:17:11.255003+00:00 |
| `btc-updown-15m-1781873100` | Bitcoin Up or Down - June 19, 8:45AM-9:00AM ET | down | 0.4900 | 0.6066 | 0.1166 | 1 | 2026-06-19T12:47:13.851266+00:00 |
| `btc-updown-15m-1781894700` | Bitcoin Up or Down - June 19, 2:45PM-3:00PM ET | down | 0.4850 | 0.5965 | 0.1115 | 1 | 2026-06-19T18:47:11.668785+00:00 |
| `btc-updown-15m-1782995400` | Bitcoin Up or Down - July 2, 8:30AM-8:45AM ET | up | 0.5050 | 0.5486 | 0.0436 | 1 | 2026-07-02T12:31:34.789102+00:00 |
| `btc-updown-15m-1782999900` | Bitcoin Up or Down - July 2, 9:45AM-10:00AM ET | up | 0.3650 | 0.4975 | 0.1325 | 1 | 2026-07-02T13:47:17.556516+00:00 |

## Meaningful session summaries

| # | Start | End | Dry-runs | Settlements | W | L | P/L | Top config traits |
|---:|---|---|---:|---:|---:|---:|---:|---|
| 1 | 2026-06-19T01:14:01.209939+00:00 | 2026-06-19T02:14:09.969988+00:00 | 1 | 0 | 0 | 0 | +0.0000 | `(live_mode=False)` |
| 2 | 2026-06-19T03:12:14.394519+00:00 | 2026-06-19T03:22:01.399388+00:00 | 1 | 0 | 0 | 0 | +0.0000 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 3 | 2026-06-19T03:22:10.211164+00:00 | 2026-06-19T03:33:15.624708+00:00 | 1 | 0 | 0 | 0 | +0.0000 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 4 | 2026-06-19T03:33:19.491292+00:00 | 2026-06-19T05:09:59.588255+00:00 | 2 | 0 | 0 | 0 | +0.0000 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 5 | 2026-06-19T05:14:23.188617+00:00 | 2026-06-19T10:30:04.134495+00:00 | 6 | 0 | 0 | 0 | +0.0000 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 6 | 2026-06-19T10:44:25.449907+00:00 | 2026-06-19T12:30:27.155651+00:00 | 6 | 3 | 0 | 3 | -15.0000 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 7 | 2026-06-19T12:32:26.214037+00:00 | 2026-06-19T12:55:36.262203+00:00 | 1 | 0 | 0 | 0 | +0.0000 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 8 | 2026-06-19T13:02:26.442575+00:00 | 2026-06-19T13:18:36.526663+00:00 | 0 | 0 | 0 | 0 | +0.0000 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 9 | 2026-06-19T13:30:09.317760+00:00 | 2026-06-19T18:51:26.810011+00:00 | 2 | 1 | 0 | 1 | -5.0000 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 10 | 2026-06-22T05:20:08.507692+00:00 | 2026-06-22T13:06:20.625843+00:00 | 3 | 3 | 3 | 0 | +20.5044 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 11 | 2026-06-22T15:31:06.225680+00:00 | 2026-06-23T18:56:37.347859+00:00 | 13 | 13 | 7 | 6 | +17.9255 | `(live_mode=False, allow_down=True, entry_window_minutes=3, min_edge=0.03)` |
| 12 | 2026-06-24T03:24:27.291698+00:00 | 2026-06-25T14:59:35.441516+00:00 | 4 | 4 | 2 | 2 | +0.6061 | `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` |
| 13 | 2026-07-02T11:42:32.541014+00:00 | 2026-07-02T12:48:37.197057+00:00 | 2 | 1 | 0 | 1 | -2.0000 | `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` |
| 14 | 2026-07-02T12:48:39.638926+00:00 | 2026-07-02T13:10:01.356529+00:00 | 0 | 0 | 0 | 0 | +0.0000 | `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` |
| 15 | 2026-07-02T13:12:34.395250+00:00 | n/a | 3 | 2 | 1 | 1 | +0.5977 | `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` |
| 16 | 2026-07-03T10:05:39.526040+00:00 | 2026-07-03T14:46:34.725754+00:00 | 0 | 0 | 0 | 0 | +0.0000 | `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` |
| 17 | 2026-07-04T05:33:52.815729+00:00 | n/a | 0 | 0 | 0 | 0 | +0.0000 | `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` |
| 18 | 2026-07-04T10:05:15.933271+00:00 | n/a | 1 | 1 | 0 | 1 | -2.0000 | `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` |
| 19 | 2026-07-05T10:04:31.654840+00:00 | n/a | 7 | 7 | 3 | 4 | +2.4634 | `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` |
| 20 | 2026-07-06T10:04:56.886812+00:00 | 2026-07-06T15:53:05.880839+00:00 | 2 | 2 | 1 | 1 | -0.1165 | `(live_mode=False, allow_down=False, entry_window_minutes=3, min_edge=0.03)` |

## State snapshot files found

| File | Processed markets | Trades in session | Wins | Losses | Profit USD |
|---|---:|---:|---:|---:|---:|
| `state.json` | 19 | 2 | 1 | 1 | -0.1165 |
| `state.pre_execution_fix_20260619T032202Z.json` | 1 | 1 | 0 | 0 | 0.0000 |
| `state.pre_filter_patch_20260619T033313Z.json` | 1 | 1 | 0 | 0 | 0.0000 |
| `state.zero_bets_stop_20260619T050952Z.json` | 6 | 2 | 0 | 0 | 0.0000 |

## Candidate archive (`dry-run-training.jsonl`) summary

- Rows: **1094**
- Distinct markets in archive: **162**
- Qualified rows: **17**
- `best_observed=1` rows: **16**
- Rows with resolved outcome attached: **1094**

| Reason | Count |
|---|---:|
| score gap below threshold | 671 |
| up rsi too hot | 301 |
| edge below threshold | 91 |
| qualified | 17 |
| price above cap | 14 |

## Notes for Claude Code

- The cleanest execution history is in `logs/machine.log`; it includes `Loop started`, per-cycle JSON blobs, and settlement events.
- `runtime/analysis/dry-run-training.jsonl` is candidate-level data, not one-row-per-trade; many rows represent non-qualified observations inside the same 15m market.
- Some log restarts can place more than one dry-run event against the same market slug, so this report separates **placement events** from **unique market slugs**.
- The most recent stopped session is also preserved in `runtime/state.json`.
- If Claude Code wants to rebuild this report programmatically, it should key trades by market slug and merge placement events (`result=dry_run`) with later `settlements` events from the log.
