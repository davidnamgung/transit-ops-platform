# Headway: a year of Boston subway service

An interactive explorer for the data pipeline in the parent folder. It reads four small JSON files
(exported from the warehouse), and everything you see is calculated in the browser: filtering, zooming,
weather comparisons, search. There is no server.

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

If the page says "The data did not load", it names the file or column that is wrong. The fix is almost always
to re-run the export and `npm run sync-data`.

## Build the site

```
npm run build        # writes the finished site to app/dist/
npm run preview      # look at the finished site locally
```

## Where things live

| Path | What it is |
| --- | --- |
| `src/styles.css` | All colors, type, spacing, and motion. The tokens at the top control both themes (Night and Day). |
| `src/lib/constants.js` | Line names and colors, day-type wording, the measures offered, weather categories. |
| `src/lib/data.js` | Loads and checks the JSON files; builds the lookups every page uses. |
| `src/lib/router.js` | A tiny hash router. Every view is a shareable link. |
| `src/pages/` | One file per page: Overview, Lines, Episodes, Weather, Method. |
| `src/components/` | Charts and controls. `YearRibbons.jsx` is the main chart. |
| `scripts/sync-data.mjs` | Copies the exports into `public/data/`. |

The rules that decide whether a day is a closure, a disruption, or a gap live in the SQL models, not here
(`models/marts/mart_line_day_context.sql`). The app only displays them. The wording that explains them is in
`src/lib/constants.js` and must be kept in step with the SQL and `docs/metrics.md`.

## Keyboard

| Keys | Does |
| --- | --- |
| Ctrl or Cmd + K | Search pages, lines, and episodes |
| Left and right arrows (chart focused) | Step through days; add Shift for a week |
| Escape (chart focused) | Zoom back out |
| Up and down arrows (episode table) | Move between episodes |

## Not in this version

Live ingestion, the Platform Health page, forecasting, and per-station reliability need pipeline work that
comes later. The Method page lists what the current numbers can and cannot tell you.
