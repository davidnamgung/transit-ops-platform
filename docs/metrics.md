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

## Known limitations
- One weather point for the whole network (central Boston).
- Open-Meteo historical data is model reanalysis, not station measurements.
- Weather is confounded with season and time of day (for example, snow only occurs
  in winter), so weather effects must be compared like with like.