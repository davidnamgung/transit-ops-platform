import { useMemo } from 'react';
import { LINES, LINE_BY_ID, LINE_GROUPS, METRIC_BY_ID } from '../lib/constants.js';
import { dateRange, median, minutes, n0, n1, pct0, plural } from '../lib/format.js';
import { href, navigate, useQueryState } from '../lib/router.js';
import { Bullet } from '../components/Bullet.jsx';
import CalendarHeat from '../components/CalendarHeat.jsx';
import { dayTip } from '../components/DayTip.jsx';
import { Figure } from '../components/Figure.jsx';
import { Legend } from '../components/Legend.jsx';
import { useTheme } from '../lib/hooks.js';
import EpisodeList from '../components/EpisodeList.jsx';
import HourlyProfile from '../components/HourlyProfile.jsx';
import { Segmented } from '../components/Segmented.jsx';
import StationMap from '../components/StationMap.jsx';
import TimeSeries from '../components/TimeSeries.jsx';

const DAILY_METRICS = [
  { id: 'gaps', label: 'Long gaps' },
  { id: 'volume', label: 'Service level' },
  { id: 'delay', label: 'Late arrivals' },
];
const HOURLY_METRICS = [
  { id: 'gaps', label: 'Long gaps' },
  { id: 'delay', label: 'Late arrivals' },
];

export default function Lines({ model }) {
  const { theme } = useTheme();
  const [params, setParams, segs] = useQueryState();
  const routeId = model.byLine.has(segs[1]) ? segs[1] : model.routes[0];
  const l = LINE_BY_ID[routeId];
  const daily = METRIC_BY_ID[params.get('metric')] && params.get('metric') !== 'type' ? params.get('metric') : 'gaps';
  const hourly = params.get('hourly') === 'delay' ? 'delay' : 'gaps';

  const rows = model.byLine.get(routeId);
  const episodes = useMemo(() => model.episodes.filter((e) => e.route_id === routeId).sort((a, b) => b.n_days - a.n_days || a.startIdx - b.startIdx), [model, routeId]);

  const facts = useMemo(() => {
    const have = rows.filter(Boolean);
    const count = (t) => have.filter((r) => r.type === t).length;
    const normal = have.filter((r) => r.type === 'normal');
    const worst = [...have].filter((r) => r.pct_headways_over_1_5x != null).sort((a, b) => b.pct_headways_over_1_5x - a.pct_headways_over_1_5x)[0];
    return {
      total: have.length,
      normal: count('normal'),
      closure: count('planned_closure'),
      disruption: count('disruption'),
      gap: count('schedule_matching_gap'),
      gapsTypical: median(normal.map((r) => r.pct_headways_over_1_5x)),
      p90Typical: median(normal.map((r) => r.p90_schedule_diff_min)),
      medianTypical: median(normal.map((r) => r.median_schedule_diff_min)),
      worst,
    };
  }, [rows]);

  const openDay = (idx) => {
    const group = LINE_GROUPS.find((g) => g.members.includes(routeId));
    navigate([], { day: model.dayIso[idx], show: group?.id });
  };

  return (
    <div className="page lines">
      <header className="page-head">
        <div className="line-tabs" role="tablist" aria-label="Choose a line">
          {LINES.filter((x) => model.byLine.has(x.id)).map((x) => (
            <a key={x.id} role="tab" aria-selected={x.id === routeId} className={`line-tab${x.id === routeId ? ' on' : ''}`} href={href(['lines', x.id], Object.fromEntries(params.entries()))}>
              <Bullet line={x} size="sm" />
              {x.name}
            </a>
          ))}
        </div>
        <h1 className="line-title"><Bullet line={l} size="lg" />{l.label}</h1>
        <p className="lede">
          {n0(facts.normal)} of {n0(facts.total)} days with data were normal. The rest were {plural(facts.closure, 'planned closure')}, {plural(facts.disruption, 'disruption')}, and {plural(facts.gap, 'schedule gap')}.
        </p>
      </header>

      <dl className="facts">
        <div><dt>On a normal day, long gaps</dt><dd>{pct0(facts.gapsTypical)}</dd><dd className="fact-note">of gaps run over 1.5 times the schedule</dd></div>
        <div><dt>On a normal day, late arrivals</dt><dd>{facts.p90Typical == null ? 'no data' : `${n1(facts.p90Typical)} min`}</dd><dd className="fact-note">is how late the slowest 10% run</dd></div>
        <div><dt>Typical arrival against schedule</dt><dd>{minutes(facts.medianTypical)}</dd><dd className="fact-note">median across normal days</dd></div>
        {facts.worst && (
          <div>
            <dt>Worst day for long gaps</dt>
            <dd>{pct0(facts.worst.pct_headways_over_1_5x)}</dd>
            <dd className="fact-note"><button type="button" className="textbtn" onClick={() => openDay(facts.worst.idx)}>{dateRange(facts.worst.service_date, facts.worst.service_date)}</button></dd>
          </div>
        )}
      </dl>

      <section className="block">
        <Figure
          title={`The ${l.name}’s year, one square per day`}
          lede="Which days were normal, and which were exceptions?"
          legend={<Legend metricId="type" theme={theme} />}
          guide="Weeks run left to right with Monday at the top. Gray-tinted squares are normal days; violet, pink, and teal mark closures, disruptions, and schedule gaps. Click a square to open that day in the explorer."
          takeaway={`${n0(facts.normal)} of ${n0(facts.total)} days were normal. The longest exception was ${episodes[0] ? `${dateRange(episodes[0].start_date, episodes[0].end_date)}: ${episodes[0].label}` : 'none, there were no exceptions'}.`}
          wide
        >
          <CalendarHeat model={model} routeId={routeId} theme={theme} size="lg" tooltipFor={(r, i) => dayTip(model, r, i)} onSelect={openDay} />
        </Figure>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Day by day</h2>
          <Segmented label="Measure" options={DAILY_METRICS} value={daily} onChange={(id) => setParams({ metric: id === 'gaps' ? null : id })} />
        </div>
        <p className="muted block-note">{METRIC_BY_ID[daily].help} Shaded stretches are episodes. Click any day to open it on the overview.</p>
        <TimeSeries model={model} routeId={routeId} metric={METRIC_BY_ID[daily]} episodes={episodes} onPick={openDay} />
      </section>

      <div className="two-up">
        <section className="block">
          <div className="block-head">
            <h2>A normal day, hour by hour</h2>
            <Segmented label="Measure" options={HOURLY_METRICS} value={hourly} onChange={(id) => setParams({ hourly: id === 'gaps' ? null : id })} />
          </div>
          <p className="muted block-note">Dry days only, so weather does not blur the picture. Hours with very few trains are left out.</p>
          <HourlyProfile model={model} routeId={routeId} metricId={hourly} />
        </section>
        <section className="block">
          <div className="block-head"><h2>Where it runs</h2></div>
          <p className="muted block-note">{n0(model.stations.filter((s) => s.routeList.includes(routeId)).length)} stations on the {l.label}, shown in place.</p>
          <StationMap stations={model.stations} routeId={routeId} />
        </section>
      </div>

      <section className="block">
        <div className="block-head">
          <h2>Episodes on the {l.label}</h2>
          <a className="link" href={href(['episodes'], { line: routeId })}>Open in Episodes</a>
        </div>
        <EpisodeList episodes={episodes.slice(0, 8)} emptyText="No closures, disruptions, or gaps were flagged for this line." onPick={(e) => navigate(['episodes'], { ep: e.key })} />
        {episodes.length > 8 && <p className="fine">and {n0(episodes.length - 8)} shorter ones.</p>}
      </section>
    </div>
  );
}
