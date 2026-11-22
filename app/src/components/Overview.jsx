import { DAY_TYPES } from '../lib/constants.js';
import { FACTS } from '../lib/facts.js';
import { dateRange, fmtDay, n0, n1, pct0, times } from '../lib/format.js';
import { href } from '../lib/router.js';

// The summary block at the top of the Overview, and the same words and numbers in the PDF report.
// Every figure is computed from the data (overviewFacts) or comes from the recorded pipeline numbers (facts.js).

const KIND_PLURAL = { planned_closure: 'planned closures', disruption: 'disruptions', schedule_matching_gap: 'schedule gaps' };
const KINDS = ['planned_closure', 'disruption', 'schedule_matching_gap'];
// Rounded down on purpose: the pipeline numbers are recorded at one build and the data grows daily.
const wholeMillions = (v) => Math.floor(v / 1e6);

export function SummaryText({ model, f }) {
  const top = [...KINDS].sort((a, b) => f.share(b) - f.share(a))[0];
  const c = f.closure;
  const s = f.storm;
  return (
    <div className="ov-text">
      <p className="ov-lead">
        {pct0(f.normalPct)} of line-days on Boston’s subway were ordinary. Of the {n0(f.all.unusual)} exceptions, {pct0(f.share(top))} were {KIND_PLURAL[top]}.
      </p>
      <p>
        {c && <>The longest closure ran on the {f.closureLine.label}, {dateRange(c.ep.start_date, c.ep.end_date)}: service fell to {times(c.ep.avg_volume_vs_typical)} of usual{f.closureOthers != null && <> while the other lines held at {times(f.closureOthers)}</>}. </>}
        {s && (
          <>
            The snowiest day, {fmtDay(model.calendar[s.stormIdx])} ({n1(s.snow)}&nbsp;cm), pushed {s.affected.length === 0 ? 'no line' : s.affected.length === 1 ? 'one line' : `${s.affected.length} lines`} past the disruption threshold
            {s.affected.length > 0 && (f.stormSlowest != null ? <>; the slowest took {n0(f.stormSlowest)} days to recover</> : f.stormOpen ? <>; at least one had not recovered within the data</> : null)}.{' '}
          </>
        )}
        {f.worst && <>Long gaps between trains were more common in {f.worst.label} hours ({pct0(f.worst.value)}) than in dry ones ({pct0(f.dry)}), a pattern the data cannot tie to a cause.</>}
      </p>
      <p>
        Headway follows the data end to end. More than {wholeMillions(FACTS.raw.stopEvents)} million stop events from the MBTA’s public records are joined with hourly weather and service alerts in a DuckDB warehouse, tested by {n0(f.checks)} data checks and {n0(FACTS.project.tests)} automated tests, and rebuilt every day. It also shows where it is weak: {n0(f.noData)} days have no data, and {pct0(f.unmatchedStops)} of recorded stops cannot be matched to the published schedule.
      </p>
    </div>
  );
}

export function Direction({ model, links = true }) {
  const rows = [
    { k: 'Question', v: 'When and where did Boston’s subway service break down this year, and why?', to: ['explore'], cta: 'Explore every day' },
    { k: 'Evidence', v: `Train records, service alerts, and hourly weather, matched day by day for ${n0(model.routes.length)} lines.`, to: ['report'], cta: 'Read the report' },
    { k: 'Method', v: `A pipeline rebuilt daily: ${n0(FACTS.build.tables)} tables, ${n0(FACTS.checks.martChecks + FACTS.checks.alertChecks)} data checks, ${n0(FACTS.project.tests)} tests.`, to: ['method'], cta: 'See how it was built' },
    { k: 'Limits', v: 'No forecasting yet and no per-station results. Days and trips the data cannot cover are marked, never filled in.', to: ['method'], cta: 'Read the limits' },
  ];
  return (
    <dl className="ov-dir">
      {rows.map((r) => (
        <div key={r.k} className="ov-dir-row">
          <dt>{r.k}</dt>
          <dd>
            {r.v}
            {links && <> <a className="link" href={href(r.to)}>{r.cta}</a></>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Kpi({ label, value, unit, note, lead = false, children }) {
  return (
    <div className={`kpi${lead ? ' kpi-lead' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-figure"><span className="kpi-value">{value}</span>{unit && <span className="kpi-unit">{unit}</span>}</div>
      <div className="kpi-note">{note}</div>
      {children}
    </div>
  );
}

export function KpiGrid({ f }) {
  const c = f.closure;
  const s = f.storm;
  return (
    <div className="kpis">
      <Kpi lead label="Ordinary days" value={pct0(f.normalPct)} note={`of ${n0(f.all.total)} line-days had nothing unusual`}>
        <ul className="kpi-kinds" aria-label="The exceptions by kind">
          {KINDS.map((k) => (
            <li key={k}><span className={`swatch swatch-${DAY_TYPES[k].css}`} aria-hidden="true" /><span>{DAY_TYPES[k].label}</span><b>{n0(f.all.counts[k])}</b></li>
          ))}
        </ul>
      </Kpi>
      {c && <Kpi label="Longest closure" value={times(c.ep.avg_volume_vs_typical)} unit="of usual service" note={f.closureOthers != null ? `${f.closureLine.label} over ${n0(c.ep.n_days)} days, vs ${times(f.closureOthers)} on the other lines` : `${f.closureLine.label} over ${n0(c.ep.n_days)} days`} />}
      {s && <Kpi label="Heaviest snow" value={n1(s.snow)} unit="cm in a day" note={`${s.affected.length} ${s.affected.length === 1 ? 'line' : 'lines'} crossed the disruption threshold${f.stormSlowest != null ? `; slowest recovery ${n0(f.stormSlowest)} days` : ''}`} />}
      {f.worst && <Kpi label={`Long gaps in ${f.worst.label}`} value={pct0(f.worst.value)} note={`vs ${pct0(f.dry)} when dry`} />}
      <Kpi label="Stops outside the schedule" value={pct0(f.unmatchedStops)} note="of recorded stops belong to unmatched trips" />
    </div>
  );
}

export function BuildStrip() {
  const items = [
    { v: `${wholeMillions(FACTS.raw.stopEvents)}M+`, l: 'stop events processed' },
    { v: n0(FACTS.build.tables), l: 'tables, rebuilt every day' },
    { v: n0(FACTS.checks.martChecks + FACTS.checks.alertChecks), l: 'data checks per build' },
    { v: n0(FACTS.project.tests), l: 'automated tests' },
  ];
  return (
    <ul className="build-strip" aria-label="How the project is built">
      {items.map((i) => (
        <li key={i.l}><b>{i.v}</b><span>{i.l}</span></li>
      ))}
    </ul>
  );
}
