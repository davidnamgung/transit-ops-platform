// Copies the JSON files written by transform/export_for_app.py into app/public/data/.
// Usage (from the app folder):  npm run sync-data
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', '..', 'exports');
const target = resolve(here, '..', 'public', 'data');
const files = ['line_days.json', 'episodes.json', 'hourly_weather.json', 'stations.json'];
const optional = ['health.json']; // only exists if you built a local run history; the site falls back to it offline

if (!existsSync(source)) {
  console.error(`Could not find ${source}\nRun this from the project root first:\n  uv run python transform/export_for_app.py`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
let missing = 0;
for (const f of files) {
  const from = join(source, f);
  if (!existsSync(from)) { console.error(`Missing: ${from}`); missing++; continue; }
  copyFileSync(from, join(target, f));
  console.log(`${f.padEnd(20)} ${(statSync(from).size / 1000).toFixed(0).padStart(6)} KB copied`);
}
for (const f of optional) {
  const from = join(source, f);
  if (existsSync(from)) { copyFileSync(from, join(target, f)); console.log(`${f.padEnd(20)} ${(statSync(from).size / 1000).toFixed(0).padStart(6)} KB copied (optional)`); }
}
if (missing) process.exit(1);
console.log(`\nData is in ${target}`);
