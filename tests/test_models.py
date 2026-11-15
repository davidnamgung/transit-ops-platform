"""
Tests of the real SQL models, run on the fake data in fixture.py. Each test states a fact we
discovered about the real data and checks that the models still honor it. If one fails, either
a model changed in a way it should not have, or a rule was changed on purpose and the test
needs to change with it.
"""
import json
import subprocess
import sys
from datetime import date, datetime, timezone

import duckdb

import conftest

D = date  # short alias used in the expected values below


# ---------- staging: trips ----------

def test_row_counts(q):
    raw, kept = q("SELECT COUNT(*), COUNT(*) FILTER (WHERE key_row_number = 1) FROM staging.stg_lamp_stop_events")[0]
    assert (raw, kept) == (1893, 1888), "5 duplicate rows should be flagged and set aside, none deleted"


def test_empty_and_missing_days_do_not_break_the_build(q):
    days = {r[0] for r in q("SELECT DISTINCT service_date FROM staging.stg_lamp_stop_events")}
    assert len(days) == 12
    assert D(2026, 1, 15) not in days  # published as an empty file
    assert D(2026, 1, 16) not in days  # not published at all


def test_trip_kinds(q):
    kinds = dict(q("SELECT trip_kind, COUNT(*) FROM staging.stg_lamp_stop_events WHERE key_row_number = 1 GROUP BY 1"))
    assert kinds == {"scheduled": 1765, "added": 118, "nonrevenue": 5}


def test_schedule_difference_is_arrival_minus_schedule(q):
    diff, local = q("""SELECT schedule_diff_sec, stop_ts_local FROM staging.stg_lamp_stop_events
                       WHERE trip_id = '101050' AND stop_sequence = 1""")[0]
    assert diff == 60  # the fake train is always 60 seconds late
    assert local == datetime(2026, 1, 5, 6, 3, 0)  # scheduled 06:02 Boston time, plus 60 seconds


def test_service_day_runs_past_midnight(q):
    service_date, local, diff = q("""SELECT service_date, stop_ts_local, schedule_diff_sec
                                     FROM staging.stg_lamp_stop_events WHERE trip_id = 'T-LATE'""")[0]
    assert service_date == D(2026, 1, 9)  # still Friday's service
    assert local == datetime(2026, 1, 10, 1, 0, 30)  # but it happens on Saturday's calendar day
    assert diff == 30  # so the scheduled time was read as 25:00, not as an error of a day


def test_green_trunk_duplicates_keep_the_trips_own_route(q):
    rows = q("""SELECT stop_sequence, route_id, key_row_number FROM staging.stg_lamp_stop_events
                WHERE trip_id = '90000001' AND stop_sequence IN (3, 4) ORDER BY 1, 3""")
    assert rows == [(3, "Green-B", 1), (3, "Green-D", 2), (4, "Green-B", 1), (4, "Green-D", 2)]
    # and the reverse case, where the trip's own route sorts after the stray one
    rows = q("""SELECT stop_sequence, route_id, key_row_number FROM staging.stg_lamp_stop_events
                WHERE trip_id = '90000002' AND stop_sequence IN (5, 6) ORDER BY 1, 3""")
    assert rows == [(5, "Green-D", 1), (5, "Green-B", 2), (6, "Green-D", 1), (6, "Green-B", 2)]


def test_same_route_duplicate_keeps_the_earliest_record(q):
    rows = q("""SELECT stop_ts_utc, key_row_number FROM staging.stg_lamp_stop_events
                WHERE trip_id = '101070' AND stop_sequence = 5 ORDER BY key_row_number""")
    assert [r[1] for r in rows] == [1, 2]
    assert rows[0][0] < rows[1][0]


def test_nonrevenue_trips_are_never_compared_with_the_schedule(q):
    rows = q("""SELECT is_schedule_comparable, headway_ratio, schedule_diff_sec
                FROM intermediate.int_stop_events_weather WHERE trip_kind = 'nonrevenue'""")
    assert len(rows) == 5
    assert not any(r[0] for r in rows)  # never comparable
    assert all(r[1] is None for r in rows)  # and never counted in the gap measure
    assert all(r[2] == -54000 for r in rows)  # they look exactly 15 hours early


def test_an_event_five_hours_late_is_still_comparable(q):
    # the old 3-hour cutoff would have dropped it; the 12-hour cap keeps it
    assert q("SELECT is_schedule_comparable FROM intermediate.int_stop_events_weather "
             "WHERE schedule_diff_sec = 18000") == [(True,)]


def test_events_beyond_twelve_hours_are_not_comparable_but_are_counted(q):
    diff, comparable = q("""SELECT schedule_diff_sec, is_schedule_comparable FROM intermediate.int_stop_events_weather
                            WHERE route_id = 'Orange' AND schedule_diff_sec > 43200""")[0]
    assert diff == 46800 and comparable is False
    assert q("SELECT n_very_late_events FROM marts.mart_daily_line_reliability "
             "WHERE route_id = 'Orange' AND service_date = DATE '2026-01-07'")[0][0] == 2  # the 5-hour and 13-hour events


def test_comparable_events_total(q):
    # 1,765 scheduled events kept, minus the one beyond the cap
    assert q("SELECT COUNT(*) FROM intermediate.int_stop_events_weather WHERE is_schedule_comparable")[0][0] == 1764


# ---------- staging: weather and stations ----------

def test_weather_has_one_row_per_hour(q):
    n, first, last = q("SELECT COUNT(*), MIN(hour_utc), MAX(hour_utc) FROM staging.stg_weather_hourly")[0]
    assert n == 14 * 24
    assert (last - first).total_seconds() == (n - 1) * 3600  # no gaps, no duplicates
    assert first == datetime(2026, 1, 5, tzinfo=timezone.utc)


def test_recent_snow_totals_stay_empty_until_a_full_window_exists(q):
    n, with24, with72 = q("SELECT COUNT(*), COUNT(snow_24h_cm), COUNT(snow_72h_cm) "
                          "FROM intermediate.int_hourly_weather_features")[0]
    assert (with24, with72) == (n - 23, n - 71)
    assert q("SELECT snow_24h_cm FROM intermediate.int_hourly_weather_features "
             "WHERE hour_utc = TIMESTAMPTZ '2026-01-09 00:00:00+00'")[0][0] == 3.6  # six snow hours at 0.6 cm


def test_weather_categories(q):
    cats = dict(q("SELECT weather_category, COUNT(*) FROM intermediate.int_stop_events_weather "
                  "WHERE service_date = DATE '2026-01-08' GROUP BY 1"))
    assert cats.get("snow") == 140  # every kept event on the snow day, all four lines
    assert q("SELECT DISTINCT weather_category FROM intermediate.int_stop_events_weather "
             "WHERE service_date = DATE '2026-01-05'") == [("dry",)]


def test_stations_list_the_lines_that_serve_them(q):
    assert q("SELECT COUNT(*) FROM staging.stg_stations")[0][0] == 5
    assert q("SELECT routes FROM staging.stg_stations WHERE station_id = 'place-pktrm'")[0][0] == "Green-B, Green-D, Orange, Red"


# ---------- alerts ----------

def test_alerts_are_rebuilt_from_all_their_versions(q):
    rows = {r[0]: r for r in q("""SELECT alert_id, severity, n_versions, is_open_ended, start_ts_utc, effective_end_utc
                                  FROM staging.stg_alerts""")}
    assert set(rows) == {1001, 1002, 1003, 1004, 1005}  # the bus alert (1006) is ignored
    _, severity, versions, open_ended, start, end = rows[1001]
    assert (severity, versions, open_ended) == (7, 3, False)  # peak severity survives the closing record's 0
    assert start == datetime(2026, 1, 12, 8, 0, tzinfo=timezone.utc)  # 03:00 Boston time
    assert end == datetime(2026, 1, 14, 2, 55, tzinfo=timezone.utc)  # the closing time beat the extended end


def test_only_the_alert_with_no_end_and_no_closing_is_open_ended(q):
    assert q("SELECT alert_id FROM staging.stg_alerts WHERE is_open_ended") == [(1005,)]


def test_alert_kinds(q):
    kinds = {r[0]: (r[1], r[2]) for r in q("SELECT alert_id, alert_kind, delay_minutes FROM intermediate.int_alerts_classified")}
    assert kinds == {
        1001: ("long_service_change", None),
        1002: ("station_skip", None),
        1003: ("delay", 20),
        1004: ("facility", None),
        1005: ("service_change_open_ended", None),
    }


def test_alerts_are_summarized_per_line_and_day(q):
    long_alerts = {(r[0], r[1]): r[2] for r in q("SELECT route_id, service_date, n_long_service_change_alerts "
                                                "FROM intermediate.int_line_day_alerts WHERE route_id = 'Red'")}
    assert long_alerts[("Red", D(2026, 1, 12))] == 1
    assert long_alerts[("Red", D(2026, 1, 13))] == 1  # the closing time (21:55) is still on the 13th
    assert long_alerts[("Red", D(2026, 1, 14))] == 0
    assert q("SELECT longest_closure_header FROM intermediate.int_line_day_alerts "
             "WHERE route_id = 'Red' AND service_date = DATE '2026-01-12'")[0][0].startswith("Red Line: Shuttle buses")
    # a skipped stop is not a closure
    green_d = q("SELECT DISTINCT n_long_service_change_alerts, n_station_alerts FROM intermediate.int_line_day_alerts "
                "WHERE route_id = 'Green-D'")
    assert green_d == [(0, 1)]
    assert q("SELECT n_delay_alerts, max_alerted_delay_min FROM intermediate.int_line_day_alerts "
             "WHERE route_id = 'Orange' AND service_date = DATE '2026-01-08'")[0] == (1, 20)


# ---------- marts ----------

def test_daily_mart_known_values(q):
    red = q("""SELECT n_events, n_comparable, pct_headways_over_1_5x, median_schedule_diff_min
               FROM marts.mart_daily_line_reliability WHERE route_id = 'Red' AND service_date = DATE '2026-01-05'""")[0]
    assert red == (40, 40, 10.0, 1.0)  # 4 of 40 gaps are long; every train is 60 seconds late
    assert q("SELECT n_events, pct_headways_over_1_5x FROM marts.mart_daily_line_reliability "
             "WHERE route_id = 'Orange' AND service_date = DATE '2026-01-08'")[0] == (20, 70.0)


def test_each_mart_has_one_row_per_its_grain(q):
    assert q("SELECT COUNT(*) FROM marts.mart_line_day_context")[0][0] == 48  # 12 days x 4 lines
    assert q("SELECT COUNT(*) - COUNT(DISTINCT (service_date, route_id)) FROM marts.mart_line_day_context")[0][0] == 0
    assert q("SELECT COUNT(*) FROM marts.mart_daily_line_reliability")[0][0] == 48


def test_day_types(q):
    unusual = q("SELECT route_id, service_date, day_type FROM marts.mart_line_day_context "
                "WHERE day_type <> 'normal' ORDER BY 1, 2")
    assert unusual == [
        ("Green-B", D(2026, 1, 10), "schedule_matching_gap"),
        ("Green-B", D(2026, 1, 11), "schedule_matching_gap"),
        ("Orange", D(2026, 1, 8), "disruption"),
        ("Red", D(2026, 1, 12), "planned_closure"),
        ("Red", D(2026, 1, 13), "planned_closure"),
    ]
    assert q("SELECT volume_vs_typical FROM marts.mart_line_day_context "
             "WHERE route_id = 'Red' AND service_date = DATE '2026-01-12'")[0][0] == 0.5
    # a gap that is only 95% unmatched is still a gap (the threshold is 90%)
    assert q("SELECT pct_added FROM marts.mart_line_day_context "
             "WHERE route_id = 'Green-B' AND service_date = DATE '2026-01-11'")[0][0] == 95.0


def test_episodes(q):
    rows = q("SELECT route_id, episode_type, start_date, end_date, n_days, label FROM marts.mart_line_episodes ORDER BY 1")
    assert rows == [
        ("Green-B", "schedule_matching_gap", D(2026, 1, 10), D(2026, 1, 11), 2,
         "Trips not matched to the schedule at a normal service level (possible data gap)"),
        ("Orange", "disruption", D(2026, 1, 8), D(2026, 1, 8), 1, "Disruption (no clear weather or alert cause)"),
        ("Red", "planned_closure", D(2026, 1, 12), D(2026, 1, 13), 2,
         "Red Line: Shuttle buses replace service between Alewife and Park Street"),
    ]


def test_hourly_mart_has_snow_rows(q):
    assert q("SELECT COUNT(*) FROM marts.mart_hourly_weather_reliability WHERE weather_category = 'snow'")[0][0] > 0


# ---------- reproducibility and the contract with the website ----------

FINGERPRINT = """
    SELECT md5(string_agg(CONCAT_WS('|', route_id, service_date, day_type, n_events, volume_vs_typical, pct_added,
                                     pct_headways_over_1_5x, p90_schedule_diff_min), ';' ORDER BY route_id, service_date))
    FROM marts.mart_line_day_context"""


def test_the_build_is_reproducible(q, tmp_path):
    second = conftest.make_project(tmp_path / "second")
    con = duckdb.connect(str(second / "data/warehouse/transit.duckdb"), read_only=True)
    assert con.execute(FINGERPRINT).fetchall() == q(FINGERPRINT)
    con.close()


# Keep in step with REQUIRED in app/src/lib/data.js: these are the columns the website reads.
APP_REQUIRED = {
    "line_days": ["service_date", "route_id", "day_type", "volume_vs_typical", "pct_added", "pct_headways_over_1_5x",
                  "p90_schedule_diff_min", "avg_temp_c", "total_precip_mm", "total_snow_cm", "max_gust_kmh", "n_delay_alerts"],
    "episodes": ["route_id", "episode_type", "start_date", "end_date", "n_days", "label"],
    "hourly_weather": ["route_id", "weather_category", "hour_local", "is_weekend", "n_comparable", "n_headways",
                       "pct_headways_over_1_5x", "p90_schedule_diff_min", "pct_within_5min"],
    "stations": ["station_id", "station_name", "latitude", "longitude", "routes"],
}


def test_the_export_has_every_column_the_website_needs(project):
    result = subprocess.run([sys.executable, "transform/export_for_app.py"], cwd=project, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    for name, columns in APP_REQUIRED.items():
        rows = json.loads((project / "exports" / f"{name}.json").read_text())
        assert rows, f"{name}.json is empty"
        missing = [c for c in columns if c not in rows[0]]
        assert not missing, f"{name}.json is missing {missing}; the website would refuse to load it"
