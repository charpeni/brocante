import { useState } from 'react';
import { parseRepository, type MarketData } from '../lib/market';

const format = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export default function RepositoryStats({ data, demo }: { data: MarketData; demo: boolean }) {
  const [open, setExpanded] = useState(false);
  const stats = data.repositoryStats;
  if (!stats) return null;
  const repository = parseRepository(data.repository);
  const bilanUrl =
    repository && !demo
      ? `https://bilan.dev/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`
      : 'https://bilan.dev/';
  return (
    <section
      className="repository-stats"
      data-expanded={open}
      aria-label={demo ? 'Demo repository activity' : 'Repository activity'}
    >
      <button
        className="repository-stats-toggle"
        aria-label={demo ? 'Demo report' : 'Repository report'}
        type="button"
        aria-expanded={open}
        aria-controls="repository-stats-content"
        onClick={() => setExpanded(!open)}
      >
        <span className="repository-report-title">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M2 14c4 0 4-9 9-9s5 12 11 12M2 17c4 0 4-9 9-9s5 12 11 12M5 14v7M11 8v13M17 16v5" />
            <path d="M8 2h6v3H8z" fill="currentColor" stroke="none" />
          </svg>
          <span className="repository-report-name">
            {demo ? 'Demo report' : 'Repository report'}
          </span>
        </span>
        <svg
          className="repository-report-window-control"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d={open ? 'M4 8h8' : 'M4 8h8M8 4v8'} />
        </svg>
      </button>
      <div id="repository-stats-content" hidden={!open}>
        <p className="repository-stats-period" title={`${stats.since} to ${stats.asOf}`}>
          Last 30 days
        </p>
        <dl>
          {(
            [
              ['PRs opened', stats.opened, stats.previousOpened],
              ['PRs merged', stats.merged, stats.previousMerged],
            ] as const
          ).map(([label, value, previous]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd title={value.toLocaleString('en-US')} aria-label={value.toLocaleString('en-US')}>
                {format.format(value)}
                <small title={`${previous.toLocaleString('en-US')} in the preceding 30 days`}>
                  {value === previous
                    ? 'No change'
                    : `${value > previous ? '+' : '−'}${format.format(Math.abs(value - previous))}`}
                </small>
              </dd>
            </div>
          ))}
        </dl>
        <p className="repository-stats-comparison">vs. the previous 30 days</p>
        <a href={bilanUrl} target="_blank" rel="noreferrer">
          <span className="repository-report-link-label">
            {demo ? 'Explore bilan.dev' : 'More on bilan.dev'}
          </span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}
