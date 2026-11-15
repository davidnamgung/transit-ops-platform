# Metric definitions

All metrics use subway data from the MBTA's LAMP performance files (rapid transit
only) and hourly Boston weather from Open-Meteo. MBTA data is used under the
MassDOT Developers License Agreement.

## Time rules
- All timestamps are stored in UTC. Boston local time is derived for display only.
- **Service date**: the MBTA's operating day, which runs past midnight. A 1 AM train
  after a Saturday belongs to Saturday service. Weekday/weekend uses service date.

## Schedule difference
- Actual stop time minus scheduled arrival time, in minutes. Positive = later than
  scheduled.
- Computed only for **comparable** events: not an ADDED trip, a schedule exists, and
  the absolute difference is 3 hours or less.
- Why the 3-hour rule: larger differences are more likely a mismatch between an
  event and its scheduled stop than a real delay. Cost: genuine multi-hour
  disruptions are excluded, which biases delay metrics downward. The excluded count
  is reported in checks. The threshold is a judgment call and can be revisited.
- Note: whether the LAMP stop timestamp is an arrival or departure time is not yet
  verified, so this is called a "schedule difference", not a "delay".

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