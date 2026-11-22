// Prints the report page of the built site to a PDF: dist/headway-report.pdf.
// Usage (from the app folder, after "npm run build"):  npm run build:pdf
// One-time setup on a new computer:                     npx playwright install chromium
//
// It serves dist/ on a private local port, opens the page "#/print" in a headless Chromium, waits for the
// charts to finish drawing, and saves it as an A4 PDF. Exit code 0 on success, 1 on any problem.
import { createReadStream, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'dist');
const out = join(dist, 'headway-report.pdf');
const EXPECTED_PAGES = 6;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const fail = (message) => {
  console.error(`\nPDF report not written: ${message}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=PDF report not built::${message}`);
  process.exit(1);
};

if (!existsSync(join(dist, 'index.html'))) fail('dist/index.html is missing. Run "npm run build" first.');
if (!existsSync(join(dist, 'data', 'line_days.json'))) fail('dist/data is missing. Run "npm run sync-data", then "npm run build".');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  fail('the "playwright" package is not installed. Run "npm install" in the app folder.');
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = resolve(dist, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/#/print`;

let browser;
try {
  try {
    browser = await chromium.launch();
  } catch (err) {
    fail(`could not start Chromium (${String(err.message).split('\n')[0]}). Run "npx playwright install chromium" once, then try again.`);
  }
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.emulateMedia({ media: 'print' });
  await page.goto(url, { waitUntil: 'networkidle' });
  try {
    await page.waitForFunction(() => window.__reportReady === true, null, { timeout: 60000 });
  } catch {
    fail(`the report page did not finish drawing.${problems.length ? ` Page error: ${problems[0]}` : ''}`);
  }
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll('.sheet')].map((el, i) => ({ n: i + 1, over: el.querySelector('.sheet-body').scrollHeight - el.querySelector('.sheet-body').clientHeight })).filter((s) => s.over > 1));
  if (overflowing.length) fail(`page ${overflowing.map((s) => `${s.n} (by ${s.over}px)`).join(', ')} has more content than fits. Shorten it or split it.`);
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
} finally {
  await browser?.close();
  server.close();
}

const bytes = readFileSync(out);
const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
const reject = (message) => {
  rmSync(out, { force: true }); // never leave a wrong PDF where the site build would publish it
  fail(message);
};
if (bytes.length < 50_000) reject(`the file is only ${bytes.length} bytes, which is too small to be right.`);
if (pages !== EXPECTED_PAGES) reject(`the report has ${pages} pages, expected ${EXPECTED_PAGES}. A sheet overflowed or went missing.`);
console.log(`Wrote ${out}  (${pages} pages, ${(bytes.length / 1024).toFixed(0)} KB)`);
