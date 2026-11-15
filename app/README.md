# Headway: a year of Boston subway service

A story, an explorer, a report, and a method document built on the pipeline in the parent folder.
The site reads four small JSON files (exported from the warehouse) and does everything else in the
browser: coloring the calendars, filtering, the weather grid, search. There is no server.

## Pages

| Page | What it is for |
| --- | --- |
| Story | The year in seven short chapters. Every chart states its point, says how to read it, and says what it shows. The sentences are computed from the data. |
| Explore | One square per day on each line. Pick a line and a measure, click a day to read every line on that day. |
| Lines | One line at a time: its calendar, daily chart, a normal day by hour, a station map, and its episodes. |
| Episodes | Every closure, disruption, and schedule gap on a timeline and in a table, with how each was labeled. |
| Weather | Hour of day by kind of weather, with a slider that hides thinly covered cells. |
| Report | The long analysis: question, evidence for each finding, checks, limits, and the plan for predictions (not built yet). |
| Method | Every stage of the pipeline, twelve decisions with their evidence, the checks, the measures, and the rules for labeling days. |

## Run it

You need Node.js 22.12 or newer (check with `node --version`). From the project root:

```
uv run python transform/build_staging.py        # only if the warehouse is out of date
uv run python transform/export_for_app.py       # writes exports/*.json
cd app
npm install                                      # first time only
npm run sync-data                                # copies exports/*.json into app/public/data/
npm run dev                                      # then open the address it prints
```

If the page says "The data did not load", it names every file and column that is wrong at once. The fix is
almost always to re-run the export and `npm run sync-data`.

## Build the site

```
npm run build        # writes the finished site to app/dist/
npm run preview      # look at the finished site locally
```

## Where things live

| Path | What it is |
| --- | --- |
| `src/styles.css` | All colors, type, spacing, and motion. Tokens at the top control both themes (Day and Night). |
| `src/lib/constants.js` | Line names and colors, day-type wording, the measures, weather categories. |
| `src/lib/facts.js` | Numbers that come from pipeline runs, not from the exported files (row counts, duplicate counts), plus the model and check tables shown on the Method page. **Update after a rebuild.** |
| `src/lib/story.js` | Everything the Story and Report compute from the data: closures, the storm and recovery times, hourly curves, alert buckets. |
| `src/lib/data.js` | Loads and checks the JSON files; builds the lookups every page uses. |
| `src/pages/` | One file per page. `Method.jsx` and `Report.jsx` hold the long-form text. |
| `src/components/` | Charts and controls. `CalendarHeat.jsx` is the signature chart; `Figure.jsx` wraps every chart with its help text. |

The rules that decide whether a day is a closure, a disruption, or a gap live in the SQL
(`models/marts/mart_line_day_context.sql`). The app only displays them. The wording that explains them is in
`src/lib/constants.js` and must stay in step with the SQL and `docs/metrics.md`.

## Keyboard

| Keys | Does |
| --- | --- |
| Ctrl or Cmd + K | Search pages, lines, and episodes |
| Arrow keys (calendar focused) | Up and down step one day, left and right step one week |
| Up and down arrows (episode table) | Move between episodes |

## Not in this version

Live ingestion, the Platform Health page, forecasting, and per-station reliability need pipeline work that comes
later. The Report says plainly that no prediction exists yet and describes the plan.
