# Metric definitions

All metrics use subway data from the MBTA's LAMP performance files (rapid transit
only) and hourly Boston weather from Open-Meteo. MBTA data is used under the
MassDOT Developers License Agreement.

## Time rules
- All timestamps are stored in UTC. Boston local time is derived for display only.
- **Service date**: the MBTA's operating day, which runs past midnight. A 1 AM train
  after a Saturday belongs to Saturday service. Weekday/weekend uses service date.

## Schedule difference
- Actual stop time minus scheduled arrival time, in minutes. Positive = later than scheduled.
- Computed only for **scheduled** trips (trip IDs that are neither ADDED nor NONREV)
  that have a schedule value, and only when the absolute difference is 12 hours or less.
- Trip kinds: ADDED = trips not matched to the published schedule (may be temporary
  service patterns or recording gaps); NONREV = non-revenue movements (inferred from
  the prefix; not confirmed in LAMP documentation). Neither carries a usable schedule.
- The 12-hour cap is a sanity limit against mismatched events, not a delay definition.
  Events more than 3 hours late are counted separately as "very late".
- Whether the LAMP stop timestamp is an arrival or a departure is not yet verified,
  so this is called a "schedule difference", not a "delay".

## Within 5 minutes
- Share of comparable events whose absolute schedule difference is 300 seconds or less.

## Headway ratio and long-gap share
- Headway = time between consecutive trains at a station. Ratio = actual / scheduled.
- Long-gap share = share of headway observations with ratio above 1.5.

## Weather categories (hourly, applied to the hour of the event)
- snow: snowfall at least 0.1 cm that hour
- heavy_rain: precipitation at least 2.5 mm that hour
- rain: precipitation at least 0.1 mm
- dry: everything else; unknown: no weather data
- Thresholds are conventional round numbers, not tuned to the data.

## Data gaps and exclusions
- 17 of the 365 requested service dates have no data: 16 were published by LAMP as
  empty files (zero rows) and 1 (2026-01-06) was not published. Charts show these as
  "no data", never as zeros. Empty files are re-requested on every run.
- Alerts: LAMP's alert file has one row per alert version and affected entity, so we
  keep each alert's newest version. Alerts with no end time and no closing time are
  flagged "open-ended" and never treated as active for an assumed duration.
- Trip kinds: scheduled (digits-only IDs, ~81% of events), ADDED (~18%), and
  NONREV (~0.4%). NONREV trips are excluded from schedule comparison and headways.
- Duplicate keys: ~0.15% of rows share a (service date, trip, stop sequence).
  We keep the earliest and set the rest aside. Only about a fifth are exact copies;
  the rest are the same vehicle at another time or platform, or two vehicles.
- Known small oddities (not yet investigated): about 400 Green-E events run more
  than 3 hours early across 42 days; Orange and Red have a few hundred
  early/late events beyond 3 hours.
- ADDED episodes can cover whole branches for days (for example all Green
  branches on Oct 31 - Nov 1, 2026), so an ADDED share is context, not an error rate.

## Known limitations
- One weather point for the whole network (central Boston).
- Open-Meteo historical data is model reanalysis, not station measurements.
- Weather is confounded with season and time of day (for example, snow only occurs
  in winter), so weather effects must be compared like with like.

## Day types and episodes (v1, provisional thresholds)
- Each service date and line gets one day type, first match wins:
  - planned_closure: a long service-change alert (12+ hours, not a single-stop skip)
    overlaps the day, and either 50%+ of events are ADDED or volume is under 80% of
    the line's typical weekday/weekend level.
  - disruption: 40%+ of headways exceed 1.5x scheduled, or volume is under 60% of typical.
  - schedule_matching_gap: 90%+ of events are ADDED trips, none of the above.
  - normal: everything else.
- An episode is a run of consecutive days with the same non-normal type on one line.
- Limitations: thresholds are not tuned per line (Green-D's normal long-gap share is
  higher than Orange's); ADDED surges of 70-89% (for example Red, Jul 1-13, 2026) fall
  below the 90% gap threshold; alerts explain closures much better than disruptions.