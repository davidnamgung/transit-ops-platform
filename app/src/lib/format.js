import { utcFormat, utcParse } from 'd3-time-format';

export const DAY_MS = 86400000;
const parseIso = utcParse('%Y-%m-%d');
const formatIso = utcFormat('%Y-%m-%d');

export const toDate = (s) => parseIso(s);
export const toIso = (d) => formatIso(d);
export const fmtDay = utcFormat('%a %b %-d, %Y');
export const fmtDayShort = utcFormat('%b %-d');
export const fmtMonth = utcFormat('%b');
export const fmtMonthYear = utcFormat('%b %Y');

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const n0 = (v) => (v == null || Number.isNaN(v) ? 'no data' : nf0.format(v));
export const n1 = (v) => (v == null || Number.isNaN(v) ? 'no data' : nf1.format(v));
export const pct1 = (v) => (v == null || Number.isNaN(v) ? 'no data' : `${nf1.format(v)}%`);
export const pct0 = (v) => (v == null || Number.isNaN(v) ? 'no data' : `${nf0.format(v)}%`);
export const times = (v) => (v == null || Number.isNaN(v) ? 'no data' : `${nf2.format(v)}x`);
export const minutes = (v) => {
  if (v == null || Number.isNaN(v)) return 'no data';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${nf1.format(Math.abs(v))} min`;
};

export function formatMetric(metric, value) {
  if (value == null || Number.isNaN(value)) return 'no data';
  if (metric.unit === '%') return pct0(value);
  if (metric.unit === 'x') return times(value);
  if (metric.unit === 'min') return `${nf1.format(value)} min`;
  return String(value);
}

export function dateRange(startIso, endIso) {
  if (startIso === endIso) return fmtDay(toDate(startIso));
  const a = toDate(startIso);
  const b = toDate(endIso);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${fmtDayShort(a)} to ${fmtDayShort(b)}, ${b.getUTCFullYear()}`;
  }
  return `${fmtDayShort(a)}, ${a.getUTCFullYear()} to ${fmtDayShort(b)}, ${b.getUTCFullYear()}`;
}

export function plural(n, one, many = `${one}s`) {
  return `${n0(n)} ${n === 1 ? one : many}`;
}

export function median(values) {
  const v = values.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function weatherSentence(row) {
  if (!row) return '';
  const parts = [];
  if (row.avg_temp_c != null) parts.push(`${nf0.format(row.avg_temp_c)}°C on average`);
  if (row.total_snow_cm > 0.05) parts.push(`${nf1.format(row.total_snow_cm)} cm of snow`);
  else if (row.total_precip_mm > 0.05) parts.push(`${nf1.format(row.total_precip_mm)} mm of rain`);
  else parts.push('dry');
  if (row.max_gust_kmh != null) parts.push(`gusts to ${nf0.format(row.max_gust_kmh)} km/h`);
  return parts.join(', ');
}
