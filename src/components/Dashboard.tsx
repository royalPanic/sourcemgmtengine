import { useMemo, useState } from 'react';
import type { SourceWithAttachments } from '../types';
import {
  computeEventAnalytics,
  formatAverage,
  STANCE_BUCKET_LABELS,
  type StanceBucket,
  type StanceStats,
  type DimensionStats,
} from '../utils/analytics';

interface DashboardProps {
  sources: SourceWithAttachments[];
  loading: boolean;
}

const BUCKET_COLORS: Record<StanceBucket, string> = {
  supports: '#10b981',
  refutes: '#ef4444',
  neutral: '#a1a1aa',
  none: '#52525b',
};

export function Dashboard({ sources, loading }: DashboardProps) {
  const [excludeUnjudgeable, setExcludeUnjudgeable] = useState(false);

  const analytics = useMemo(
    () => computeEventAnalytics(sources, { excludeUnjudgeable }),
    [sources, excludeUnjudgeable]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-amber-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (analytics.totalSources === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-zinc-500">
          <svg className="mx-auto h-12 w-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">No sources to analyse</p>
          <p className="text-xs mt-1">Add sources with stances and Admiralty ratings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-5 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Event Dashboard</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Admiralty averages per stance. Lower scores are better.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeUnjudgeable}
              onChange={(e) => setExcludeUnjudgeable(e.target.checked)}
              className="accent-amber-500"
            />
            Exclude unjudgeable (F / 6)
          </label>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Sources" value={String(analytics.totalSources)} />
          <StatCard
            label="With Stance"
            value={String(analytics.totalSources - analytics.unassigned)}
            hint={`${analytics.unassigned} unassigned`}
          />
          <StatCard
            label="Avg Reliability"
            value={formatAverage(analytics.overall.reliability.average)}
            hint={analytics.overall.reliability.label ? `≈ ${analytics.overall.reliability.label}` : 'no ratings'}
          />
          <StatCard
            label="Avg Credibility"
            value={formatAverage(analytics.overall.credibility.average)}
            hint={analytics.overall.credibility.label ? `≈ ${analytics.overall.credibility.label}` : 'no ratings'}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <section className="card p-4">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">Stance Distribution</h3>
            <StancePieChart byStance={analytics.byStance} total={analytics.totalSources} />
          </section>

          <section className="card p-4">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">Average Reliability by Stance</h3>
            <DimensionBars
              byStance={analytics.byStance}
              dimension="reliability"
              max={6}
            />
          </section>

          <section className="card p-4 xl:col-span-2">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">Average Credibility by Stance</h3>
            <DimensionBars
              byStance={analytics.byStance}
              dimension="credibility"
              max={6}
            />
          </section>
        </div>

        <section className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-200">Breakdown</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 border-b border-zinc-800">
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2 font-medium">Stance</th>
                <th className="px-4 py-2 font-medium text-right">Sources</th>
                <th className="px-4 py-2 font-medium text-right">Avg Reliability</th>
                <th className="px-4 py-2 font-medium text-right">Avg Credibility</th>
                <th className="px-4 py-2 font-medium text-right">Rated</th>
              </tr>
            </thead>
            <tbody>
              {analytics.byStance.map(stats => (
                <tr key={stats.bucket} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: BUCKET_COLORS[stats.bucket] }}
                      />
                      <span className="text-zinc-200">{STANCE_BUCKET_LABELS[stats.bucket]}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-300">{stats.total}</td>
                  <td className="px-4 py-2.5 text-right">
                    <DimensionCell stats={stats.reliability} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DimensionCell stats={stats.credibility} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-zinc-500">
                    {stats.reliability.rated}/{stats.credibility.rated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="text-[11px] text-zinc-600 leading-relaxed">
          Reliability is scored A=1 … F=6 and credibility 1–6, so a lower average indicates a
          more trustworthy body of evidence. Averages only include sources that carry a rating
          for that dimension.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-100">{value}</div>
      {hint && <div className="text-[11px] text-zinc-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function DimensionCell({ stats }: { stats: DimensionStats }) {
  if (stats.average === null) {
    return <span className="text-zinc-600">—</span>;
  }
  return (
    <span className="text-zinc-200">
      {formatAverage(stats.average)}
      <span className="ml-1 text-xs text-zinc-500">({stats.label})</span>
    </span>
  );
}

function StancePieChart({ byStance, total }: { byStance: StanceStats[]; total: number }) {
  const slices = byStance.filter(s => s.total > 0);

  // Build conic-gradient stops for a dependency-free pie.
  let cursor = 0;
  const stops: string[] = [];
  for (const slice of slices) {
    const start = (cursor / total) * 100;
    cursor += slice.total;
    const end = (cursor / total) * 100;
    stops.push(`${BUCKET_COLORS[slice.bucket]} ${start}% ${end}%`);
  }

  return (
    <div className="flex items-center gap-5">
      <div
        className="w-32 h-32 rounded-full shrink-0"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
        role="img"
        aria-label={`Stance distribution across ${total} sources`}
      >
        <div className="w-full h-full rounded-full flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-zinc-900 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold text-zinc-100">{total}</span>
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">sources</span>
          </div>
        </div>
      </div>

      <ul className="flex-1 space-y-1.5 min-w-0">
        {byStance.map(slice => {
          const pct = total === 0 ? 0 : Math.round((slice.total / total) * 100);
          return (
            <li key={slice.bucket} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: BUCKET_COLORS[slice.bucket] }}
              />
              <span className="text-zinc-300 flex-1 truncate">
                {STANCE_BUCKET_LABELS[slice.bucket]}
              </span>
              <span className="text-zinc-400 tabular-nums">{slice.total}</span>
              <span className="text-zinc-600 tabular-nums w-9 text-right">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DimensionBars({
  byStance,
  dimension,
  max,
}: {
  byStance: StanceStats[];
  dimension: 'reliability' | 'credibility';
  max: number;
}) {
  const rows = byStance.filter(s => s.total > 0);

  return (
    <div className="space-y-2.5">
      {rows.map(stats => {
        const dim = stats[dimension];
        const pct = dim.average === null ? 0 : (dim.average / max) * 100;

        return (
          <div key={stats.bucket} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-zinc-400 truncate">
              {STANCE_BUCKET_LABELS[stats.bucket]}
            </span>
            <div className="flex-1 h-5 rounded bg-zinc-950/60 overflow-hidden relative">
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: BUCKET_COLORS[stats.bucket],
                  opacity: dim.average === null ? 0 : 0.75,
                }}
              />
              {dim.average === null && (
                <span className="absolute inset-0 flex items-center px-2 text-[11px] text-zinc-600">
                  no ratings
                </span>
              )}
            </div>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-300">
              {formatAverage(dim.average)}
              {dim.label && <span className="text-zinc-500"> ({dim.label})</span>}
            </span>
          </div>
        );
      })}

      <div className="flex items-center gap-3 pt-1">
        <span className="w-24 shrink-0" />
        <div className="flex-1 flex justify-between text-[10px] text-zinc-600 tabular-nums">
          <span>1 (best)</span>
          <span>6 (worst)</span>
        </div>
        <span className="w-16 shrink-0" />
      </div>
    </div>
  );
}
