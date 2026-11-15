import { LINE_BY_ID, LINE_GROUPS } from './constants.js';
import { median } from './format.js';

// Everything the story and report pages compute from the exported data.
// No claim is typed in by hand: if the data changes, the sentences change with it.

const TYPES = ['normal', 'planned_closure', 'disruption', 'schedule_matching_gap'];

export function countsByLine(model) {
  return model.routes.map((id) => {
    const counts = { normal: 0, planned_closure: 0, disruption: 0, schedule_matching_gap: 0 };
    let nodata = 0;
    for (const r of model.byLine.get(id)) {
      if (!r) nodata += 1;
      else counts[r.type] += 1;
    }
    const total = TYPES.reduce((s, t) => s + counts[t], 0);
    return { id, counts, nodata, total, unusual: total - counts.normal };
  });
}

export function totalCounts(byLine) {
  const counts = { normal: 0, planned_closure: 0, disruption: 0, schedule_matching_gap: 0 };
  for (const l of byLine) for (const t of TYPES) counts[t] += l.counts[t];
  const total = TYPES.reduce((s, t) => s + counts[t], 0);
  return { counts, total, unusual: total - counts.normal };
}

export function longestEpisode(model, type) {
  return model.episodes.filter((e) => e.episode_type === type).sort((a, b) => b.n_days - a.n_days || a.startIdx - b.startIdx)[0] || null;
}

export function lineTypical(model, id, field) {
  return median(model.byLine.get(id).filter((r) => r && r.type === 'normal').map((r) => r[field]));
}

// Closure figure: one line's service level next to every other line's, around its longest closure.
export function closureStory(model) {
  const ep = longestEpisode(model, 'planned_closure');
  if (!ep) return null;
  const a = Math.max(0, ep.startIdx - 9);
  const b = Math.min(model.nDays - 1, ep.endIdx + 9);
  const series = model.routes.map((id) => {
    const pts = [];
    for (let i = a; i <= b; i++) {
      const r = model.byLine.get(id)[i];
      if (r && r.volume_vs_typical != null) pts.push({ x: i, y: r.volume_vs_typical });
    }
    return { id, points: pts, hero: id === ep.route_id };
  });
  const totalDays = model.episodes.filter((e) => e.episode_type === 'planned_closure').reduce((s, e) => s + e.n_days, 0);
  return { ep, a, b, series, closureEpisodes: model.episodes.filter((e) => e.episode_type === 'planned_closure').length, totalDays };
}

// Storm figure: the snowiest day, how badly each line's gaps grew, and how long they took to recover.
export function stormStory(model) {
  let stormIdx = -1;
  let snow = 0;
  for (let i = 0; i < model.nDays; i++) {
    for (const id of model.routes) {
      const r = model.byLine.get(id)[i];
      if (r) {
        if (r.total_snow_cm > snow) { snow = r.total_snow_cm; stormIdx = i; }
        break;
      }
    }
  }
  if (stormIdx < 0 || snow < 3) return null;
  const a = Math.max(0, stormIdx - 6);
  const b = Math.min(model.nDays - 1, stormIdx + 15);
  const lo = Math.max(0, stormIdx - 1);
  const hi = Math.min(model.nDays - 1, stormIdx + 7);
  const affected = [];
  for (const id of model.routes) {
    const arr = model.byLine.get(id);
    let peak = -1;
    let peakIdx = -1;
    for (let i = lo; i <= hi; i++) {
      const v = arr[i]?.pct_headways_over_1_5x;
      if (v != null && v > peak) { peak = v; peakIdx = i; }
    }
    if (peak < 40) continue;
    const typical = lineTypical(model, id, 'pct_headways_over_1_5x');
    let recoveredIdx = null;
    for (let i = peakIdx + 1; i <= model.nDays - 2; i++) {
      const v = arr[i]?.pct_headways_over_1_5x;
      const w = arr[i + 1]?.pct_headways_over_1_5x;
      if (v != null && v <= typical + 8 && (w == null || w <= typical + 8)) { recoveredIdx = i; break; }
    }
    affected.push({ id, peak, peakIdx, typical, recoveredIdx, daysToRecover: recoveredIdx == null ? null : recoveredIdx - stormIdx });
  }
  affected.sort((x, y) => y.peak - x.peak);
  const lines = affected.slice(0, 4);
  const series = lines.map((l) => {
    const pts = [];
    for (let i = a; i <= b; i++) {
      const v = model.byLine.get(l.id)[i]?.pct_headways_over_1_5x;
      if (v != null) pts.push({ x: i, y: v });
    }
    return { id: l.id, points: pts, hero: true };
  });
  const bars = [];
  for (let i = a; i <= b; i++) {
    for (const id of model.routes) {
      const r = model.byLine.get(id)[i];
      if (r) { bars.push({ x: i, v: r.total_snow_cm || 0 }); break; }
    }
  }
  return { stormIdx, snow, a, b, affected: lines, series, bars };
}

// Month-by-line table of the share of trips not in the schedule.
export function addedByMonth(model) {
  const months = [];
  model.calendar.forEach((d, i) => {
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (!months.length || months[months.length - 1].key !== key) months.push({ key, date: d, from: i, to: i });
    else months[months.length - 1].to = i;
  });
  const rows = model.routes.map((id) => {
    const arr = model.byLine.get(id);
    const cells = months.map((m) => {
      const vals = [];
      for (let i = m.from; i <= m.to; i++) if (arr[i] && arr[i].pct_added != null) vals.push(arr[i].pct_added);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    });
    return { id, cells };
  });
  return { months, rows };
}

// Hour-of-day curves for each line group, weighted by how many observations each hour had.
export function hourlyCurves(model, { weekend = false, category = 'dry', field = 'pct_headways_over_1_5x', weight = 'n_headways', minN = 150 } = {}) {
  return LINE_GROUPS.filter((g) => g.members.some((m) => model.byLine.has(m))).map((g) => {
    const points = [];
    for (let h = 0; h < 24; h++) {
      let sum = 0;
      let n = 0;
      for (const r of model.hourly) {
        if (r.hour_local === h && r.is_weekend === weekend && r.weather_category === category && g.members.includes(r.route_id) && r[field] != null && r[weight]) {
          sum += r[field] * r[weight];
          n += r[weight];
        }
      }
      if (n >= minN) points.push({ x: h, y: sum / n, n });
    }
    return { id: g.id, label: g.label.replace(' (B to E)', ''), css: g.css, points };
  });
}

// Average long-gap share by kind of weather, all lines, weekdays and weekends together.
export function weatherBars(model, { field = 'pct_headways_over_1_5x', weight = 'n_headways' } = {}) {
  const out = {};
  for (const r of model.hourly) {
    if (r[field] == null || !r[weight]) continue;
    const o = (out[r.weather_category] ||= { sum: 0, n: 0 });
    o.sum += r[field] * r[weight];
    o.n += r[weight];
  }
  return out;
}

// Do days with more delay alerts really look worse in the measurements?
export function delayAlertBuckets(model) {
  const buckets = [
    { id: '0', label: 'No delay alerts', test: (n) => n === 0, gaps: [], p90: [] },
    { id: '1-2', label: '1 to 2 alerts', test: (n) => n >= 1 && n <= 2, gaps: [], p90: [] },
    { id: '3-5', label: '3 to 5 alerts', test: (n) => n >= 3 && n <= 5, gaps: [], p90: [] },
    { id: '6+', label: '6 or more', test: (n) => n >= 6, gaps: [], p90: [] },
  ];
  for (const r of model.rows) {
    if (r.n_delay_alerts == null) continue;
    const b = buckets.find((x) => x.test(r.n_delay_alerts));
    if (!b) continue;
    if (r.pct_headways_over_1_5x != null) b.gaps.push(r.pct_headways_over_1_5x);
    if (r.p90_schedule_diff_min != null) b.p90.push(r.p90_schedule_diff_min);
  }
  return buckets.map((b) => ({ id: b.id, label: b.label, days: b.gaps.length, gaps: median(b.gaps), p90: median(b.p90) }));
}

export const lineName = (id) => LINE_BY_ID[id]?.label || id;
