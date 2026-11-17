# Runbook

What to do when something goes wrong, written so that someone who has never seen the project can follow it.
Every alert, every red square on the Health page, and every failed run on the Actions tab leads back to a section here.

## Where things live

| Thing | Where |
| --- | --- |
| The daily pipeline | GitHub, **Actions** tab, workflow **Pipeline** (`.github/workflows/pipeline.yml`) |
| Code-only website changes | **Actions** tab, workflow **Site** (`.github/workflows/site.yml`) |
| Tests and lint on every push | **Actions** tab, workflow **CI** |
| The run history | The `pipeline-health` branch, file `health.json`; shown on the website's **Health** page |
| Secrets | **Settings, Secrets and variables, Actions**: `MBTA_API_KEY`, `DISCORD_WEBHOOK_URL` |
| The website | `https://davidnamgung.github.io/transit-ops-platform/` |

## First, read the alert

A Discord alert looks like this:

```
Pipeline FAILED at `check/marts` after 94 seconds.
Repository: davidnamgung/transit-ops-platform
Run: https://github.com/davidnamgung/transit-ops-platform/actions/runs/123456789

Last lines of its output:
...
```

The word after "FAILED at" is the stage. Find it below. Click the **Run** link, open the failed step, and read the lines
just above the red mark; that is almost always the whole story.

**Nothing was damaged.** A failed run publishes nothing, so the website keeps showing the last good data. The cost of a
failure is a day of staleness, not wrong numbers.

## By stage

### `download/trips`
Downloads one file per day from the MBTA's performance-data server.
- **"FAILED: [dates]"**: a download kept failing after three retries (network trouble or an MBTA outage). Re-run the
  workflow later; the files already downloaded are kept, so a re-run only fetches what is missing.
- **"FAILED: N files not published ... blocking us"**: more than 20 days looked unpublished. A normal year has about one.
  Either the MBTA has an outage or their server is refusing GitHub's network. Re-run in a few hours. If it persists, the
  daily files are listed at the MBTA's LAMP site; check there first.
- A day that is "published but EMPTY" is normal. The MBTA publishes about 16 empty files a year, and they show as hatched
  squares on the website.

### `download/weather`
Fetches a year of hourly weather from Open-Meteo. It fails if the download fails or does not return exactly 24 hours for
every day. Usually an Open-Meteo outage: re-run later. If it keeps returning the wrong row count, Open-Meteo's archive may
not have caught up to the newest day; the pipeline already stops 7 days short of today for this reason.

### `download/alerts`
Downloads the MBTA alert history and checks it is readable and has at least 1,000,000 rows (it has about 5 million). A
failure means the download broke or the MBTA changed the file. Re-run once; if it fails again, run
`uv run python ingestion/06_refresh_alerts.py` on your computer and read what it prints.

### `download/stations`
Fetches station names for the 8 lines from the MBTA API. The API key is optional but speeds this up. A failure is almost
always a temporary API problem. Re-run.

### `build/warehouse`
Rebuilds the database from the raw files. A failure here means a SQL error. The log prints `Building <table> ...` for each
table, and the failure is under the last one printed. It usually follows a change to a model or a change in the MBTA's file
format. Reproduce it on your computer with:
`uv run python pipeline/run.py --skip-download --only build`.

### `check/staging`, `check/marts`, `check/alerts`
The data-quality checks. Each prints `[PASS]`, `[WARN]` or `[FAIL]` lines; only `[FAIL]` fails the run. Find the `[FAIL]`
line; its text says what was wrong:

| If the failed check says | It means | Likely cause |
| --- | --- | --- |
| key columns are never null | a column the pipeline depends on is empty | the MBTA changed a column name or format |
| no duplicate hours / no missing hours (weather) | the weather table has a gap | a partial weather download |
| intermediate has exactly the de-duplicated staging rows | rows were lost or added between layers | a model change |
| daily mart covers every service date in staging | a day went missing between layers | a model change |
| at least 1,000 alerts started inside our data window | the alert history looks too small | a truncated or changed alert file |
| known alerts are present with a start time | three alerts known to exist are missing | the alert-rebuilding rule broke |

One warning is permanent and expected: about 265 line-days have no trips that can be compared with the timetable. It is a
`[WARN]`, never a failure.

### `check/freshness`
The newest service day in the data is more than 12 days old. A normal run shows about 7 to 9. Either the MBTA stopped
publishing or the download stage found nothing new: read the `download/trips` section of the same log. Only raise the limit
(`MAX_AGE_DAYS` in `pipeline/run.py`) on purpose.

### `export/app files`
Writes the four small files the website reads. It almost never fails. If it does, the marts are missing a column; the test
`test_the_export_has_every_column_the_website_needs` exists to catch this before it ships.

### `workflow/setup`
Shown on the Health page when the run failed before the pipeline could start, so no record exists. Open the run and look at
the first red step. The usual causes: `uv.lock` is out of step with `pyproject.toml` (run `uv lock` and commit), or GitHub
itself had a problem (re-run).

## Other failures

### The Publish job failed
- **"Get Pages site failed" or "Not Found"**: Pages is not switched on. **Settings, Pages, Source: GitHub Actions.**
- **"Artifact not found"**: the Pipeline job failed or skipped; fix that first. Nothing is wrong with publishing itself.

### The health job failed
It adds the run to `health.json` on the `pipeline-health` branch. A permission error means that **Settings, Actions,
General, Workflow permissions** blocks writing; the job asks for write access itself, which normally works. The website
keeps working; the Health page just misses that run.

### No Discord message arrived
Run **Pipeline, Run workflow, tick "Only send a test alert"**. Read the output:
- `DISCORD_WEBHOOK_URL is not set`: the secret is missing or misnamed.
- `HTTP 404`: the webhook was deleted. Create a new one in Discord (channel settings, Integrations, Webhooks) and
  replace the secret.
- `HTTP 403`: the request was blocked. Tell whoever maintains the project; the alert script sends a User-Agent for this reason.

### The Health page says "Overdue"
No run has been recorded for 36 hours. In order:
1. **GitHub is just late.** Scheduled runs often start 5 to 60 minutes after their time. Wait an hour.
2. **The schedule was switched off.** GitHub turns scheduled workflows off after 60 days without repository activity.
   Open **Actions, Pipeline**. A banner saying the scheduled workflow is disabled means exactly this: click **Enable
   workflow**, then **Run workflow**. A daily "keepalive" job re-enables the workflow to prevent this; it may not fully
   prevent it, which is why the Health page watches the clock itself.
3. **The pipeline keeps failing.** The page would say "Failing", not "Overdue".

### The website shows old data
The site only updates after a run that passed. Check the Health page: a "Failing" status means the last good run's data is
what is showing. Fix the failure; the next passing run publishes.

### A website change is not live
Changes under `app/` publish through the **Site** workflow on every push to `main`. Open **Actions, Site**. If it failed on
"Get the data the live site is showing", the site's data files were missing or damaged; run the **Pipeline** workflow once
and it will publish a complete site. Then hard-refresh your browser (Cmd+Shift+R).

## Practice

Do this once, so that the first real failure is not the first time you see one:

1. **Actions, Pipeline, Run workflow**, tick **"Practice run: fail on purpose at the marts check"**.
2. You should get a Discord alert within about two minutes, a red square on the Health page, and a row in its Incidents
   table. The website must not change.
3. Run the workflow again with nothing ticked. It should pass, and the Health page returns to Healthy.
4. Fill in `docs/postmortem-template.md` as if it had been real.

## Rolling back

If a change to the code caused a problem: `git revert <commit>` and push. The **CI** and **Site** workflows rebuild the code.
Data is not affected, because it comes from the pipeline and the live site, not from the repository.

## Changing a secret

- **MBTA key**: replace `MBTA_API_KEY` under Settings, Secrets and variables, Actions.
- **Discord**: create a new webhook, replace `DISCORD_WEBHOOK_URL`, delete the old webhook in Discord.
- If a secret may have leaked, replace it first and investigate second.
