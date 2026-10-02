"use client";

import { useId, useState, useSyncExternalStore } from 'react';
import type { NextGenPlayer, NextGenSeason } from '@/lib/nextgen-stats';
import type { ArchivePhase } from '@/lib/season-archive';
import { formatMediaDate } from '@/lib/media';
import { publicPffGrades } from '@/lib/pff-public';
import styles from './AdvancedSeasonStats.module.css';

const groups = ['passing', 'receiving', 'rushing'] as const;
const groupLabels = { passing: 'Quarterbacks', receiving: 'Pass catchers', rushing: 'Runners' };
const locationEvent = 'ajetsfan:season-filter';
const subscribe = (notify: () => void) => {
  window.addEventListener('popstate', notify);
  window.addEventListener(locationEvent, notify);
  return () => { window.removeEventListener('popstate', notify); window.removeEventListener(locationEvent, notify); };
};
const snapshot = () => window.location.search;
const serverSnapshot = () => '';

function selectPlayer(group: typeof groups[number], id?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('ngs-group', group);
  if (id) url.searchParams.set('ngs-player', id); else url.searchParams.delete('ngs-player');
  if (url.href === window.location.href) return;
  window.history.pushState(window.history.state, '', url);
  window.dispatchEvent(new Event(locationEvent));
}

function valueLabel(metric: NextGenPlayer['metrics'][number]) {
  const value = metric.value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${value}${metric.unit === 'seconds' ? ' sec' : metric.unit === 'yards' ? ' yd' : metric.unit === 'percent' ? (metric.id === 'completion_percentage_above_expectation' ? ' pp' : '%') : metric.unit === 'ratio' ? '×' : ''}`;
}

type Props = {
  year: number;
  phase: ArchivePhase;
  nextgen: NextGenSeason | null;
  checkedAt: string | null;
  guideHref?: string;
  embedded?: boolean;
};

export default function AdvancedSeasonStats({ year, phase, nextgen, checkedAt, guideHref, embedded = false }: Props) {
  const search = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const params = new URLSearchParams(search);
  const requestedGroup = params.get('ngs-group') as typeof groups[number];
  const group = groups.includes(requestedGroup) ? requestedGroup : 'passing';
  const [selections, setSelections] = useState<Partial<Record<typeof groups[number], string>>>({});
  const playerSelectId = useId();
  const grades = phase === 'playoffs' ? [] : publicPffGrades.filter((item) => item.year === year);
  const players = nextgen?.[group] ?? [];
  const player = players.find((item) => item.id === params.get('ngs-player')) ?? players.find((item) => item.id === selections[group]) ?? players[0];
  const postseason = phase === 'playoffs';
  const guide = guideHref ?? `/seasons/${year}/guide?phase=${phase}`;

  function chooseGroup(item: typeof groups[number]) {
    if (player) setSelections((previous) => ({ ...previous, [group]: player.id }));
    const nextPlayer = nextgen?.[item].find((entry) => entry.id === selections[item]) ?? nextgen?.[item][0];
    selectPlayer(item, item === group ? player?.id : nextPlayer?.id);
  }

  return <section id="advanced-evidence" className={`${styles.desk} ${embedded ? styles.embedded : ''}`} data-advanced-stats={year} aria-labelledby="advanced-stats-heading">
    {embedded ? <h2 id="advanced-stats-heading" className="sr-only">Tracking &amp; grades</h2> : <header className={styles.header}><h2 id="advanced-stats-heading" className="hed">Tracking &amp; grades.</h2><span>{year}</span></header>}
    <div className={styles.tracking} data-nextgen-stats>
      <div className={styles.providerHead}><h3>NFL Next Gen Stats</h3><span className={styles.scope}>Regular season</span></div>
      {postseason ? <p className={styles.gap} data-nextgen-unavailable>Next Gen tracking is available for the regular season only.</p> : nextgen ? <>
        <div className={styles.tabs} role="group" aria-label="Next Gen player group">{groups.map((item) => <button type="button" key={item} aria-pressed={group === item} onClick={() => chooseGroup(item)} data-nextgen-group={item}>{groupLabels[item]} <span>{nextgen[item].length}</span></button>)}</div>
        {player ? <>
          <div className={styles.playerChoice}><label htmlFor={playerSelectId}>Player</label><select id={playerSelectId} value={player.id} onChange={(event) => { setSelections((previous) => ({ ...previous, [group]: event.target.value })); selectPlayer(group, event.target.value); }} data-nextgen-player-select>{players.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
          <article className={styles.player} data-nextgen-player={player.id}>
            <header><div><span>{player.position} · {player.team}</span><h4>{player.name}</h4></div><p className={styles.sample}>{player.sample.toLocaleString('en-US')} {player.sampleLabel}</p></header>
            {player.teams?.length ? <p className={styles.clubs} data-nextgen-clubs>All-club season aggregate: {player.teams.join(' / ')}.</p> : null}
            <dl className={styles.metrics}>{player.metrics.map((metric) => <div key={metric.id} data-nextgen-metric={metric.id}><dt>{metric.label}</dt><dd><span>{valueLabel(metric)}</span></dd></div>)}</dl>
            <details className={styles.explanation} data-nextgen-explanation key={`${year}-${group}-${player.id}`}><summary>What these numbers mean</summary><dl>{player.metrics.map((metric) => <div key={metric.id} data-nextgen-definition={metric.id}><dt>{metric.label}</dt><dd>{metric.note}</dd></div>)}</dl></details>
          </article>
        </> : <p className={styles.gap} data-nextgen-empty>No published Jets {group} measurements for {year}.</p>}
      </> : <p className={styles.gap} data-nextgen-unavailable>{year < 2016 ? 'Next Gen coverage begins in 2016.' : `No checked tracking measurements for ${year} yet.`}</p>}
      <div className={styles.more}><a href={`${guide}#tracking`}>Tracking guide &amp; sources →</a>{checkedAt ? <span>Updated {formatMediaDate(checkedAt)}</span> : null}</div>
    </div>
    <div className={styles.grading} data-pff-stats>
      <div className={styles.providerHead}><h3>PFF grades</h3><span className={styles.scope}>Reviewed public excerpts</span></div>
      {grades.length ? <div className={styles.grades}>{grades.map((item) => <article key={item.id} data-pff-grade={item.id}>
        <p className={styles.gradeSubject}>{item.subject}<span>{item.metric}</span></p>
        <div className={styles.gradeValue}><strong>{item.grade.toFixed(1)}</strong><span>PFF grade<br />0–100 scale</span></div>
        <h4>#{item.rank}{item.population ? ` of ${item.population}` : ''} <span>{item.populationLabel}</span></h4>
        <p className={styles.scope}>{item.scope}</p>
        <span className={styles.date} data-pff-source-date>Source {formatMediaDate(item.sourceDate)}</span>
        <details className={styles.explanation} data-pff-explanation><summary>Grade details</summary><p>{item.note}</p><p>Reviewed {formatMediaDate(item.checkedAt)}</p><a href={item.source} target="_blank" rel="noreferrer">Verify at PFF ↗<span className="sr-only"> (opens in a new tab)</span></a></details>
      </article>)}</div> : <p className={styles.gap} data-pff-unavailable>{postseason ? 'No reviewed postseason PFF grades for this selection.' : `No reviewed public PFF grades for ${year}.`}</p>}
      <div className={styles.more}><a href={`${guide}#pff`}>PFF guide &amp; sources →</a></div>
    </div>
  </section>;
}
