// Everything about "what a line is" and "what a day type means" lives here,
// so wording and colors can be changed in one place.

export const LINES = [
  { id: 'Red', label: 'Red Line', name: 'Red', bullet: 'R', css: 'red' },
  { id: 'Orange', label: 'Orange Line', name: 'Orange', bullet: 'O', css: 'orange' },
  { id: 'Blue', label: 'Blue Line', name: 'Blue', bullet: 'Bl', css: 'blue' },
  { id: 'Green-B', label: 'Green Line B', name: 'Green B', bullet: 'B', css: 'green' },
  { id: 'Green-C', label: 'Green Line C', name: 'Green C', bullet: 'C', css: 'green' },
  { id: 'Green-D', label: 'Green Line D', name: 'Green D', bullet: 'D', css: 'green' },
  { id: 'Green-E', label: 'Green Line E', name: 'Green E', bullet: 'E', css: 'green' },
  { id: 'Mattapan', label: 'Mattapan Line', name: 'Mattapan', bullet: 'M', css: 'mattapan' },
];
export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
export const ROUTE_ORDER = LINES.map((l) => l.id);

// Filter groups shown above the chart (Green is one switch for its four branches).
export const LINE_GROUPS = [
  { id: 'Red', label: 'Red', css: 'red', bullet: 'R', members: ['Red'] },
  { id: 'Orange', label: 'Orange', css: 'orange', bullet: 'O', members: ['Orange'] },
  { id: 'Blue', label: 'Blue', css: 'blue', bullet: 'Bl', members: ['Blue'] },
  { id: 'Green', label: 'Green (B to E)', css: 'green', bullet: 'G', members: ['Green-B', 'Green-C', 'Green-D', 'Green-E'] },
  { id: 'Mattapan', label: 'Mattapan', css: 'mattapan', bullet: 'M', members: ['Mattapan'] },
];

export const DAY_TYPES = {
  normal: {
    label: 'Normal',
    css: 'normal',
    short: 'Nothing unusual flagged. Shown in each line’s own faint color.',
    long: 'Service was in its usual range. Most days fall here.',
  },
  planned_closure: {
    label: 'Planned closure',
    css: 'closure',
    short: 'A long service-change alert covered the day.',
    long:
      'A service-change alert lasting 12 hours or more (a closure, diversion, or shuttle replacement) covered the day, and either at least half of the trips were not in the published schedule or trains ran at under 80% of the usual volume.',
  },
  disruption: {
    label: 'Disruption',
    css: 'disruption',
    short: 'Trains came far less often than scheduled.',
    long:
      'At least 40% of the gaps between trains were more than 1.5 times the scheduled gap, or trains ran at under 60% of the usual volume, without a matching closure alert.',
  },
  schedule_matching_gap: {
    label: 'Schedule gap',
    css: 'gap',
    short: 'Trips could not be matched to the schedule.',
    long:
      'At least 90% of trips were not in the published schedule, yet service ran at a normal level. This points to a record-keeping gap more than a service problem.',
  },
};
export const DAY_TYPE_ORDER = ['normal', 'planned_closure', 'disruption', 'schedule_matching_gap'];

export const METRICS = [
  { id: 'type', label: 'What happened', help: 'Each day is colored by what kind of day it was.' },
  {
    id: 'gaps',
    label: 'Long gaps',
    field: 'pct_headways_over_1_5x',
    domain: [0, 60],
    higherIsWorse: true,
    unit: '%',
    help: 'Share of gaps between trains that were more than 1.5 times the scheduled gap.',
  },
  {
    id: 'volume',
    label: 'Service level',
    field: 'volume_vs_typical',
    domain: [0, 1.2],
    higherIsWorse: false,
    unit: 'x',
    help: 'How many train stops were recorded compared with a usual day for that line (1.0 is usual).',
  },
  {
    id: 'delay',
    label: 'Late arrivals',
    field: 'p90_schedule_diff_min',
    domain: [0, 40],
    higherIsWorse: true,
    unit: 'min',
    help: 'How late the slowest 10% of arrivals were compared with the schedule (the 90th percentile).',
  },
];
export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export const WEATHER_CATEGORIES = [
  { id: 'dry', label: 'Dry', note: 'No measurable precipitation that hour' },
  { id: 'rain', label: 'Rain', note: '0.1 mm or more that hour' },
  { id: 'heavy_rain', label: 'Heavy rain', note: '2.5 mm or more that hour' },
  { id: 'snow', label: 'Snow', note: '0.1 cm or more of snowfall that hour' },
];
