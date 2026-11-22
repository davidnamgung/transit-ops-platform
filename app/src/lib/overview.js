import { LINE_BY_ID } from './constants.js';
import { FACTS } from './facts.js';
import { closureOthers, closureStory, countsByLine, stormStory, totalCounts, weatherBars } from './story.js';

// Everything the Overview page and the PDF report say about the year, computed from the data.
// Nothing here is typed in by hand except the pipeline numbers in facts.js.

const WEATHER_LABELS = { rain: 'rain', heavy_rain: 'heavy rain', snow: 'snow' };

export function overviewFacts(model) {
  const byLine = countsByLine(model);
  const all = totalCounts(byLine);
  const closure = closureStory(model);
  const storm = stormStory(model);
  const wb = weatherBars(model);
  const avg = (k) => (wb[k] ? wb[k].sum / wb[k].n : null);
  const dry = avg('dry');
  const worst = Object.keys(WEATHER_LABELS)
    .map((id) => ({ id, label: WEATHER_LABELS[id], value: avg(id), n: wb[id]?.n || 0 }))
    .filter((w) => w.value != null && dry != null)
    .sort((a, b) => b.value - a.value)[0] || null;

  const rate = (l) => (l.total ? l.unusual / l.total : 0);
  const ranked = [...byLine].sort((a, b) => rate(b) - rate(a));
  const share = (t) => (all.unusual ? (all.counts[t] / all.unusual) * 100 : 0);
  const unmatchedStops = (FACTS.tripKinds.added / (FACTS.tripKinds.added + FACTS.tripKinds.scheduled + FACTS.tripKinds.nonrevenue)) * 100;

  const recoveries = storm ? storm.affected.map((a) => a.daysToRecover) : [];
  const stormSlowest = recoveries.length && recoveries.every((d) => d != null) ? Math.max(...recoveries) : null;
  const stormOpen = recoveries.some((d) => d == null);

  return {
    all,
    normalPct: all.total ? (all.counts.normal / all.total) * 100 : 0,
    share,
    mostExceptions: ranked[0] || null,
    fewestExceptions: ranked[ranked.length - 1] || null,
    exceptionRate: rate,
    closure,
    closureOthers: closureOthers(model, closure),
    closureLine: closure ? LINE_BY_ID[closure.ep.route_id] : null,
    storm,
    stormSlowest,
    stormOpen,
    dry,
    worst,
    unmatchedStops,
    noData: model.gaps.length,
    checks: FACTS.checks.martChecks + FACTS.checks.alertChecks,
  };
}
