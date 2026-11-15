import { scaleLinear } from 'd3-scale';

// One color scale for every "how bad" metric: cool and quiet when fine, hot when not.
export const RAMP_STOPS = {
  night: ['#1d2f45', '#2d6489', '#4fb0ad', '#e6d36a', '#f2924a', '#f0527c'],
  day: ['#e4ebf1', '#b7d6e5', '#74c2b9', '#e9c84f', '#ee8a3a', '#d63566'],
};

export function makeRamp(theme) {
  const colors = RAMP_STOPS[theme] || RAMP_STOPS.night;
  const domain = colors.map((_, i) => i / (colors.length - 1));
  return scaleLinear().domain(domain).range(colors).clamp(true);
}

// Returns a color for a metric value, or null when there is no value.
export function metricColor(metric, value, ramp) {
  if (value == null || Number.isNaN(value)) return null;
  const [lo, hi] = metric.domain;
  let t = (value - lo) / (hi - lo);
  t = Math.max(0, Math.min(1, t));
  if (metric.higherIsWorse === false) t = 1 - t;
  return ramp(t);
}

export function gradientCss(theme) {
  const colors = RAMP_STOPS[theme] || RAMP_STOPS.night;
  return `linear-gradient(to right, ${colors.join(', ')})`;
}
