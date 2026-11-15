"""
A tiny, fake, fully known set of raw files that contains every oddity we found in the real data.

The fixture covers fourteen days (Mon 5 Jan to Sun 18 Jan 2026) on four lines, so the tests can
state exact expected answers. Nothing here is real MBTA data. January is used on purpose: no
daylight-saving change, so the arithmetic in the tests stays simple.

What is planted, and what the tests expect:
  Red       Mon 12 and Tue 13 Jan  a planned closure (a long alert, half the trains, all ADDED)
  Orange    Thu 8 Jan              a disruption (70% long gaps, half the trains, snow)
  Green-B   Sat 10 and Sun 11 Jan  a schedule gap (100% and 95% of events ADDED, normal volume, no alert)
  Green-B/D Tue 6 Jan              two trips each recorded on a second Green branch at two stops (both directions)
  Red       Tue 6 Jan              a non-revenue trip that looks 15 hours early
  Red       Wed 7 Jan              a duplicate record on the same route
  Orange    Wed 7 Jan              an event 13 hours late (beyond the 12-hour cap) and one 5 hours late (within it)
  Red       Fri 9 Jan              an event after midnight (scheduled 25:00)
  Thu 15 Jan                       published as an empty file;  Fri 16 Jan: not published at all
"""
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import duckdb

NY = ZoneInfo("America/New_York")
FIRST = date(2026, 1, 5)  # a Monday
DAYS = [FIRST + timedelta(days=i) for i in range(14)]
EMPTY_DAY = date(2026, 1, 15)
MISSING_DAY = date(2026, 1, 16)
LINES = ["Red", "Orange", "Green-B", "Green-D"]
ROUTE_NUM = {"Red": 1, "Orange": 2, "Green-B": 3, "Green-D": 4}
SNOW_DAY = date(2026, 1, 8)

COLUMNS = [
    ("stop_sequence", "SMALLINT"), ("stop_id", "VARCHAR"), ("parent_station", "VARCHAR"),
    ("move_timestamp", "BIGINT"), ("stop_timestamp", "BIGINT"), ("travel_time_seconds", "BIGINT"),
    ("dwell_time_seconds", "BIGINT"), ("headway_trunk_seconds", "BIGINT"), ("headway_branch_seconds", "BIGINT"),
    ("occupancy_status", "VARCHAR"), ("occupancy_percentage", "VARCHAR"), ("service_date", "BIGINT"),
    ("route_id", "VARCHAR"), ("direction_id", "BOOLEAN"), ("start_time", "BIGINT"), ("vehicle_id", "VARCHAR"),
    ("branch_route_id", "VARCHAR"), ("trunk_route_id", "VARCHAR"), ("stop_count", "SMALLINT"),
    ("trip_id", "VARCHAR"), ("vehicle_label", "VARCHAR"), ("vehicle_consist", "VARCHAR"),
    ("direction", "VARCHAR"), ("direction_destination", "VARCHAR"), ("scheduled_arrival_time", "BIGINT"),
    ("scheduled_departure_time", "BIGINT"), ("scheduled_travel_time", "BIGINT"),
    ("scheduled_headway_branch", "BIGINT"), ("scheduled_headway_trunk", "BIGINT"),
]


def local_epoch(d, hour=0, minute=0):
    """Unix seconds for a Boston wall-clock time."""
    return int(datetime(d.year, d.month, d.day, hour, minute, tzinfo=NY).timestamp())


def event(d, route, trip_id, seq, sched_sec, delay_sec, headway=300, sched_headway=300, stop_count=10,
          stop_suffix=None, actual_epoch=None, parent=None):
    """One row of a LAMP file. sched_sec=None means the trip has no scheduled time (ADDED/NONREV)."""
    actual = actual_epoch if actual_epoch is not None else local_epoch(d) + sched_sec + delay_sec
    return (
        seq, f"stop-{stop_suffix or seq}", parent or f"place-{route}-{seq}", None, actual, 30, 40, headway, None,
        "NO_DATA_AVAILABLE", "", int(d.strftime("%Y%m%d")), route, True, 21600, f"V-{route}", None, route,
        stop_count, trip_id, "1", "1|2", "North", "Somewhere", sched_sec, sched_sec, 120 if sched_sec else None,
        None, sched_headway,
    )


def trips(d, route, n_trips, added=False, long_pct=10, delay=60):
    """n_trips of 10 stops each. long_pct percent of events get a long gap (480 s against 300 s)."""
    rows = []
    for j in range(n_trips):
        trip_id = f"ADDED-{ROUTE_NUM[route]}{d:%m%d}{j}" if added else f"{ROUTE_NUM[route]}{d:%m%d}{j}"
        for s in range(1, 11):
            idx = j * 10 + s - 1
            long_gap = (idx % 10) < long_pct // 10
            sched = None if added else 6 * 3600 + j * 1800 + s * 120
            actual = local_epoch(d) + (6 * 3600 + j * 1800 + s * 120) + delay
            rows.append(event(d, route, trip_id, s, sched, delay, headway=480 if long_gap else 300,
                              actual_epoch=actual))
    return rows


def day_rows(d):
    rows = []
    for route in LINES:
        n, added, long_pct = 4, False, 10
        if route == "Red" and d in (date(2026, 1, 12), date(2026, 1, 13)):
            n, added = 2, True  # planned closure
        if route == "Orange" and d == SNOW_DAY:
            n, long_pct = 2, 70  # disruption
        if route == "Green-B" and d == date(2026, 1, 11):
            # a schedule gap that is 95% unmatched, not 100%: 38 ADDED events and 2 scheduled ones
            rows += trips(d, route, 4, added=True)[:38] + trips(d, route, 1)[:2]
            continue
        if route == "Green-B" and d == date(2026, 1, 10):
            added = True  # a schedule gap that is 100% unmatched
        rows += trips(d, route, n, added=added, long_pct=long_pct)

    if d == date(2026, 1, 6):
        # non-revenue trip: actual 05:00, "scheduled" 20:00 (looks 15 hours early)
        for s in range(1, 6):
            rows.append(event(d, "Red", "NONREV-900", s, 20 * 3600 + s * 120, 0, stop_count=5,
                              actual_epoch=local_epoch(d, 5) + s * 120))
        # a Green-B trip that is also recorded under Green-D at stops 3 and 4 (the shared trunk)
        for s in range(1, 11):
            sched = 15 * 3600 + s * 120
            rows.append(event(d, "Green-B", "90000001", s, sched, 30, parent=f"place-trunk-{s}"))
        for s in (3, 4):
            sched = 15 * 3600 + s * 120
            rows.append(event(d, "Green-D", "90000001", s, sched, 30, parent=f"place-trunk-{s}"))
        # the reverse: a Green-D trip also recorded under Green-B at stops 5 and 6. Here the trip's own
        # route sorts AFTER the stray one, so a rule that just picks the alphabetically first route fails.
        for s in range(1, 11):
            rows.append(event(d, "Green-D", "90000002", s, 16 * 3600 + s * 120, 30, parent=f"place-trunk2-{s}"))
        for s in (5, 6):
            rows.append(event(d, "Green-B", "90000002", s, 16 * 3600 + s * 120, 30, parent=f"place-trunk2-{s}"))
    if d == date(2026, 1, 7):
        # same-route duplicate: trip 0 stop 5 recorded twice, 20 seconds apart
        first = trips(d, "Red", 1)[4]
        rows.append(first[:4] + (first[4] + 20,) + first[5:])
        # an event 13 hours after its scheduled time
        rows.append(event(d, "Orange", "T-LONG", 1, 8 * 3600, 13 * 3600, stop_count=1))
        # an event 5 hours late: comparable under the 12-hour cap, but would be dropped by the old 3-hour rule
        rows.append(event(d, "Orange", "T-LATE5", 1, 9 * 3600, 5 * 3600, stop_count=1))
    if d == date(2026, 1, 9):
        # scheduled 25:00 (01:00 the next calendar day), arrives 30 seconds late
        rows.append(event(d, "Red", "T-LATE", 1, 90000, 30, stop_count=1))
    return rows


def write_lamp(root):
    con = duckdb.connect()
    cols = ", ".join(f"{n} {t}" for n, t in COLUMNS)
    out = Path(root) / "data/raw/lamp"
    out.mkdir(parents=True, exist_ok=True)
    for d in DAYS:
        if d == MISSING_DAY:
            continue
        con.execute("DROP TABLE IF EXISTS t")
        con.execute(f"CREATE TABLE t ({cols})")
        if d != EMPTY_DAY:  # the empty day keeps the columns but has zero rows
            con.executemany(f"INSERT INTO t VALUES ({', '.join('?' for _ in COLUMNS)})", day_rows(d))
        con.execute(f"COPY t TO '{out / (d.isoformat() + '.parquet')}' (FORMAT PARQUET)")


def write_weather(root):
    times, temp, precip, snow, speed, gust = [], [], [], [], [], []
    start = datetime(FIRST.year, FIRST.month, FIRST.day)
    for h in range(14 * 24):
        t = start + timedelta(hours=h)
        times.append(t.strftime("%Y-%m-%dT%H:%M"))
        is_snow = t.date() == SNOW_DAY and 10 <= t.hour <= 15  # 10:00-15:00 UTC, six hours
        temp.append(-2.0 if is_snow else 3.0)
        snow.append(0.6 if is_snow else 0.0)
        precip.append(2.0 if is_snow else 0.0)
        speed.append(15.0)
        gust.append(30.0)
    payload = {"latitude": 42.36, "longitude": -71.06, "timezone": "GMT", "hourly": {
        "time": times, "temperature_2m": temp, "precipitation": precip, "snowfall": snow,
        "wind_speed_10m": speed, "wind_gusts_10m": gust}}
    out = Path(root) / "data/raw/weather"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"boston_hourly_{DAYS[0]}_{DAYS[-1]}.json").write_text(json.dumps(payload))


def write_stations(root):
    out = Path(root) / "data/raw/stops"
    out.mkdir(parents=True, exist_ok=True)
    for route in LINES:
        stops = [{"id": "place-pktrm", "attributes": {"name": "Park Street", "latitude": 42.3564, "longitude": -71.0624}},
                 {"id": f"place-{route}-only", "attributes": {"name": f"{route} Station", "latitude": 42.3, "longitude": -71.1}}]
        (out / f"stops_{route}.json").write_text(json.dumps({"data": stops}))


ALERT_COLUMNS = [
    ("id", "BIGINT"), ("cause", "VARCHAR"), ("cause_detail", "VARCHAR"), ("effect", "VARCHAR"),
    ("effect_detail", "VARCHAR"), ("severity_level", "VARCHAR"), ("severity", "TINYINT"),
    ("alert_lifecycle", "VARCHAR"), ("duration_certainty", "VARCHAR"),
    ('"header_text.translation.text"', "VARCHAR"), ('"description_text.translation.text"', "VARCHAR"),
    ('"service_effect_text.translation.text"', "VARCHAR"), ('"timeframe_text.translation.text"', "VARCHAR"),
    ('"recurrence_text.translation.text"', "VARCHAR"), ("created_datetime", "TIMESTAMP"),
    ("created_timestamp", "BIGINT"), ("last_modified_datetime", "TIMESTAMP"), ("last_modified_timestamp", "BIGINT"),
    ("last_push_notification_datetime", "TIMESTAMP"), ("last_push_notification_timestamp", "BIGINT"),
    ("closed_datetime", "TIMESTAMP"), ("closed_timestamp", "BIGINT"),
    ('"active_period.start_datetime"', "TIMESTAMP"), ('"active_period.start_timestamp"', "BIGINT"),
    ('"active_period.end_datetime"', "TIMESTAMP"), ('"active_period.end_timestamp"', "BIGINT"),
    ('"informed_entity.route_id"', "VARCHAR"), ('"informed_entity.route_type"', "TINYINT"),
    ('"informed_entity.direction_id"', "TINYINT"), ('"informed_entity.stop_id"', "VARCHAR"),
    ('"informed_entity.facility_id"', "VARCHAR"), ('"informed_entity.activities"', "VARCHAR"),
]


def alert_row(alert_id, modified, effect, severity, header, route, start=None, end=None, closed=None,
              route_type=1, level="INFO"):
    """One raw alert row (one version of one alert for one affected route)."""
    return (alert_id, "UNKNOWN_CAUSE", "UNKNOWN_CAUSE", effect, effect, level, severity, "ONGOING", "UNKNOWN",
            header, None, None, None, None, None, modified, None, modified, None, None, None, closed,
            None, start, None, end, route, route_type, None, None, None, None)


def write_alerts(root):
    L = local_epoch
    rows = []
    h1 = "Red Line: Shuttle buses replace service between Alewife and Park Street"
    # alert 1001: three versions. The newest is a closing record: no period, severity reset to 0.
    start, end1, end2 = L(date(2026, 1, 12), 3), L(date(2026, 1, 13), 3), L(date(2026, 1, 14), 3)
    rows += [alert_row(1001, L(date(2026, 1, 11), 12), "DETOUR", 7, h1, "Red", start, end1),
             alert_row(1001, L(date(2026, 1, 11), 12), "DETOUR", 7, h1, "Red", start, end1),  # second affected stop
             alert_row(1001, L(date(2026, 1, 12), 6), "DETOUR", 7, h1, "Red", start, end2),
             alert_row(1001, L(date(2026, 1, 13), 22), "DETOUR", 0, h1, "Red", None, None,
                       closed=L(date(2026, 1, 13), 21, 55))]
    # alert 1002: one stop skipped for weeks (must not count as a closure)
    rows.append(alert_row(1002, L(date(2026, 1, 4), 9), "NO_SERVICE", 3,
                          "Green Line D: Trains are not stopping at Dean Road inbound", "Green-D",
                          L(date(2026, 1, 5)), L(date(2026, 1, 30))))
    # alert 1003: a delay alert with a closing record
    rows += [alert_row(1003, L(date(2026, 1, 8), 6), "OTHER_EFFECT", 8,
                       "Delays of about 20 minutes due to a signal problem at Wellington", "Orange",
                       L(date(2026, 1, 8), 6), L(date(2026, 1, 8), 8)),
             alert_row(1003, L(date(2026, 1, 8), 8), "OTHER_EFFECT", 0,
                       "Delays of about 20 minutes due to a signal problem at Wellington", "Orange",
                       None, None, closed=L(date(2026, 1, 8), 7, 50))]
    # alert 1004: an elevator notice (facility)
    rows.append(alert_row(1004, L(date(2026, 1, 8), 5), "ACCESSIBILITY_ISSUE", 1, "Elevator 802 unavailable",
                          "Orange", L(date(2026, 1, 8), 5), L(date(2026, 1, 9))))
    # alert 1005: open-ended (no end time, never closed)
    rows.append(alert_row(1005, L(date(2026, 1, 6), 1), "REDUCED_SERVICE", 6,
                          "Orange Line: reduced service until further notice", "Orange", L(date(2026, 1, 6))))
    # alert 1006: a bus alert that must be ignored
    rows.append(alert_row(1006, L(date(2026, 1, 8), 5), "DETOUR", 5, "Route 1 detour", "1", L(date(2026, 1, 8)),
                          L(date(2026, 1, 9)), route_type=3))
    con = duckdb.connect()
    con.execute(f"CREATE TABLE a ({', '.join(f'{n} {t}' for n, t in ALERT_COLUMNS)})")
    con.executemany(f"INSERT INTO a VALUES ({', '.join('?' for _ in ALERT_COLUMNS)})", rows)
    out = Path(root) / "data/raw/alerts"
    out.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY a TO '{out / 'LAMP_RT_ALERTS.parquet'}' (FORMAT PARQUET)")


def write_raw(root):
    write_lamp(root)
    write_weather(root)
    write_stations(root)
    write_alerts(root)
