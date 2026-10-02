"use client";

import { useState } from 'react';
import type { NextGenPlayer, NextGenSeason } from '@/lib/nextgen-stats';
import type { ArchivePhase } from '@/lib/season-archive';
import { formatMediaDate } from '@/lib/media';
import { publicPffGrades } from '@/lib/pff-public';
import styles from './AdvancedSeasonStats.module.css';

const groups = ['passing', 'receiving', 'rushing'] as const;
const groupLabels = { passing: 'Quarterbacks', receiving: 'Pass catchers', rushing: 'Runners' };
function valueLabel(metric: NextGenPlayer['metrics'][number]) {
  const value = metric.value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${value}${metric.unit === 'seconds' ? ' sec' : metric.unit === 'yards' ? ' yd' : metric.unit === 'percent' ? (metric.id === 'completion_percentage_above_expectation' ? ' pp' : '%') : metric.unit === 'ratio' ? '×' : ''}`;
}

export default function AdvancedSeasonStats({ year, phase, nextgen, checkedAt }: { year: number; phase: ArchivePhase; nextgen: NextGenSeason | null; checkedAt: string | null }) {
  const [group, setGroup] = useState<typeof groups[number]>('passing');
  const grades = phase === 'playoffs' ? [] : publicPffGrades.filter((item) => item.year === year);
  const players = nextgen?.[group] ?? [];
  const postseason = phase === 'playoffs';
  return <section id="advanced-evidence" className={styles.desk} data-advanced-stats={year} aria-labelledby="advanced-stats-heading">
    <header className={styles.header}><div><p className={styles.kicker}>Tracking &amp; charted performance</p><h2 id="advanced-stats-heading" className="hed">Beyond the box score.</h2></div><p>Next Gen measures movement.<br />PFF grades performance.</p></header>
    <div className={styles.tracking} data-nextgen-stats>
      <div className={styles.providerHead}><div><span className={styles.provider}>NFL Next Gen Stats</span><h3>The space. The timing. The expectation.</h3></div><a href="https://nextgenstats.nfl.com/stats/passing" target="_blank" rel="noreferrer">Explore NFL tracking ↗<span className="sr-only"> (opens in a new tab)</span></a></div>
      <p className={styles.scope}>{year} regular-season player aggregates · NFL tracking data distributed by nflverse{checkedAt ? ` · checked ${formatMediaDate(checkedAt)}` : ''}</p>
      {postseason ? <p className={styles.gap} data-nextgen-unavailable>Postseason tracking aggregates are not included in this edition. Switch to regular season to inspect available measurements.</p> : nextgen ? <>
        <div className={styles.tabs} role="group" aria-label="Next Gen player group">{groups.map((item) => <button type="button" key={item} aria-pressed={group === item} onClick={() => setGroup(item)} data-nextgen-group={item}>{groupLabels[item]} <span>{nextgen[item].length}</span></button>)}</div>
        {players.length ? <div className={styles.playerGrid}>{players.map((player) => <article className={styles.player} key={player.id} data-nextgen-player={player.id}><header><span>{player.position} · {player.team}</span><h4>{player.name}</h4><p>{player.sample.toLocaleString('en-US')} {player.sampleLabel}</p>{player.teams?.length ? <p data-nextgen-clubs>All-club season aggregate: {player.teams.join(" / ")}.</p> : null}</header><dl>{player.metrics.map((metric) => <div key={metric.id} data-nextgen-metric={metric.id}><dt>{metric.label}</dt><dd><span>{valueLabel(metric)}</span><p>{metric.note}</p></dd></div>)}</dl></article>)}</div> : <p className={styles.gap} data-nextgen-empty>No Jets-tagged {group} aggregate is published in this source for {year}. Missing measurements are not zero production.</p>}
        <div className={styles.notes}>{nextgen.notes.map((note) => <p key={note}>{note}</p>)}</div>
      </> : <p className={styles.gap} data-nextgen-unavailable>{year < 2016 ? 'The available Next Gen source begins in 2016. This season predates its tracking coverage.' : 'No checked Next Gen player aggregate is available for this season yet.'}</p>}
      <p className={styles.note}>These are published tracking measurements, not reconstructed player coordinates. Separation describes space at the catch or incompletion; completion percentage above expectation compares actual completions with the NFL model. No unverified tracking rank is inferred.</p>
      <a className={styles.source} href="https://github.com/nflverse/nflverse-data/releases/tag/nextgen_stats" target="_blank" rel="noreferrer">Inspect the Next Gen source files ↗<span className="sr-only"> (opens in a new tab)</span></a>
    </div>
    <div className={styles.grading} data-pff-stats>
      <div className={styles.providerHead}><div><span className={styles.provider}>PFF · public source excerpts</span><h3>A different lens on performance.</h3></div><a href="https://www.pff.com/nfl/teams/new-york-jets/22/stats" target="_blank" rel="noreferrer">Jets at PFF ↗<span className="sr-only"> (opens in a new tab)</span></a></div>
      {grades.length ? <div className={styles.grades}>{grades.map((item) => <article key={item.id} data-pff-grade={item.id}><p>{item.subject} · {item.metric}</p><div className={styles.gradeValue}><strong>{item.grade.toFixed(1)}</strong><span>PFF grade<br />0–100 scale</span></div><h4>#{item.rank}{item.population ? ` of ${item.population}` : ''} <span>{item.populationLabel}</span></h4><p className={styles.scope}>{item.scope}</p><p className={styles.note}>{item.note}</p><a href={item.source} target="_blank" rel="noreferrer">Verify at PFF ↗<span className="sr-only"> (opens in a new tab)</span></a><small>Source dated {formatMediaDate(item.sourceDate)}<br />Reviewed {formatMediaDate(item.checkedAt)}</small></article>)}</div> : <p className={styles.gap} data-pff-unavailable>{postseason ? 'No postseason PFF grade excerpt is included for this selection.' : `No public PFF grade excerpt has been reviewed for ${year} in this edition.`} The PFF link opens its team page; select the year there where access allows.</p>}
      <p className={styles.note}>PFF sets its grading method and qualification rules. These few dated public excerpts are manually reviewed, separate from the league statistical rankings. A continuous, comprehensive PFF grades integration requires authorized API access and permission to display the data. <a href="https://www.pff.com/subscribe" target="_blank" rel="noreferrer">PFF access options ↗<span className="sr-only"> (opens in a new tab)</span></a></p>
    </div>
  </section>;
}
