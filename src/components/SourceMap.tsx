import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SourceWithAttachments } from '../types';
import {
  collectGeoPoints,
  computeBounds,
  project,
  buildGraticule,
  formatCoordinate,
  clusterProjected,
  ringToPath,
  type GeoPoint,
  type PinCluster,
} from '../utils/geo';
import { WORLD_RINGS } from '../utils/worldOutline';

interface SourceMapProps {
  sources: SourceWithAttachments[];
}

const STANCE_COLORS: Record<string, string> = {
  supports: '#10b981',
  refutes: '#ef4444',
  neutral: '#a1a1aa',
  none: '#71717a',
};

const MAP_HEIGHT = 320;

/**
 * A dependency-free world map that automatically crops to the geolocated
 * sources. There is no pan or zoom: the viewport is derived from the pins, so
 * the map always frames exactly what matters.
 */
export function SourceMap({ sources }: SourceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  // Scopes the clip path so multiple maps on one page do not collide.
  const clipId = `map-viewport-${useId().replace(/:/g, '')}`;

  const points = useMemo(() => collectGeoPoints(sources), [sources]);

  // Track the container width so the projection can match the real aspect ratio.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });

    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  const viewport = { width: Math.max(width, 1), height: MAP_HEIGHT };
  const bounds = useMemo(
    () => computeBounds(points, viewport),
    // Recompute only when the points or the measured width change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, viewport.width, viewport.height]
  );

  const graticule = useMemo(() => buildGraticule(bounds), [bounds]);

  const projected = useMemo(
    () =>
      points.map(p => ({
        point: p,
        ...project(p.lat, p.lon, bounds, viewport),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, bounds, viewport.width, viewport.height]
  );

  // Pins that land on top of each other collapse into one marker with a count.
  const clusters = useMemo(() => clusterProjected(projected), [projected]);

  // Land outlines give the pins geographic context. Rings are pre-split at the
  // antimeridian, so each one is a single continuous path.
  const landPaths = useMemo(
    () =>
      WORLD_RINGS.map(ring => ringToPath(ring, bounds, viewport)).filter(
        path => path !== ''
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds, viewport.width, viewport.height]
  );

  if (points.length === 0) {
    return (
      <div className="text-center py-10 text-zinc-500">
        <svg className="mx-auto h-10 w-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p className="text-sm">No geolocated sources</p>
        <p className="text-xs mt-1">Add coordinates to a source to see it here</p>
      </div>
    );
  }

  const hoveredCluster = clusters.find(c => c.key === hovered);

  return (
    <div>
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800"
        style={{ height: MAP_HEIGHT }}
      >
        {width > 0 && (
          <svg
            width={viewport.width}
            height={viewport.height}
            className="absolute inset-0"
            role="img"
            aria-label={`Map of ${points.length} geolocated sources`}
          >
            {/* Land outlines, clipped to the viewport */}
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={viewport.width} height={viewport.height} />
              </clipPath>
            </defs>
            <g
              clipPath={`url(#${clipId})`}
              fill="#1f1f23"
              stroke="#52525b"
              strokeWidth={0.75}
              strokeLinejoin="round"
              fillRule="evenodd"
            >
              {landPaths.map((path, index) => (
                <path key={index} d={path} />
              ))}
            </g>

            {/* Graticule */}
            <g stroke="#27272a" strokeWidth={1}>
              {graticule.lats.map(lat => {
                const { y } = project(lat, bounds.minLon, bounds, viewport);
                return <line key={`lat-${lat}`} x1={0} y1={y} x2={viewport.width} y2={y} />;
              })}
              {graticule.lons.map(lon => {
                const { x } = project(bounds.minLat, lon, bounds, viewport);
                return <line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={viewport.height} />;
              })}
            </g>

            {/* Equator and prime meridian, when in view */}
            {bounds.minLat <= 0 && bounds.maxLat >= 0 && (
              <line
                x1={0}
                y1={project(0, bounds.minLon, bounds, viewport).y}
                x2={viewport.width}
                y2={project(0, bounds.minLon, bounds, viewport).y}
                stroke="#3f3f46"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )}
            {bounds.minLon <= 0 && bounds.maxLon >= 0 && (
              <line
                x1={project(bounds.minLat, 0, bounds, viewport).x}
                y1={0}
                x2={project(bounds.minLat, 0, bounds, viewport).x}
                y2={viewport.height}
                stroke="#3f3f46"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )}

            {/* Pins */}
            {clusters.map(cluster => {
              const isHovered = hovered === cluster.key;
              const count = cluster.points.length;
              const color =
                count > 1 ? '#e4e4e7' : STANCE_COLORS[cluster.points[0].stance ?? 'none'];
              return (
                <g
                  key={cluster.key}
                  transform={`translate(${cluster.x}, ${cluster.y})`}
                  onMouseEnter={() => setHovered(cluster.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle r={isHovered ? 11 : 8} fill={color} fillOpacity={0.2} />
                  <circle
                    r={isHovered ? 7 : count > 1 ? 6 : 3.5}
                    fill={count > 1 ? '#18181b' : color}
                    stroke={count > 1 ? color : '#09090b'}
                    strokeWidth={count > 1 ? 1.5 : 1.5}
                  />
                  {count > 1 && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={7}
                      fontWeight={600}
                      fill={color}
                      className="select-none pointer-events-none"
                    >
                      {count}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* Tooltip */}
        {hoveredCluster && (
          <ClusterTooltip cluster={hoveredCluster} viewport={viewport} />
        )}

        {/* Extent readout */}
        <div className="absolute bottom-1.5 right-2 text-[10px] text-zinc-600 tabular-nums">
          {formatExtent(bounds)}
        </div>
      </div>

      <MapLegend points={points} />
    </div>
  );
}

function ClusterTooltip({
  cluster,
  viewport,
}: {
  cluster: PinCluster;
  viewport: { width: number; height: number };
}) {
  const count = cluster.points.length;
  const first = cluster.points[0];

  return (
    <div
      className="absolute pointer-events-none z-10 rounded-md bg-zinc-900 border border-zinc-700 px-2 py-1.5 shadow-lg max-w-[220px]"
      style={{
        left: Math.min(Math.max(cluster.x + 10, 4), Math.max(viewport.width - 224, 4)),
        top: Math.min(Math.max(cluster.y - 10, 4), MAP_HEIGHT - 60),
      }}
    >
      {count === 1 ? (
        <>
          <div className="text-xs font-medium text-zinc-100 truncate">{first.title}</div>
          <div className="text-[11px] text-zinc-400">
            {first.label ?? formatCoordinate(first.lat, first.lon)}
          </div>
          {first.label && (
            <div className="text-[10px] text-zinc-500">
              {formatCoordinate(first.lat, first.lon)}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-xs font-medium text-zinc-100">{count} sources here</div>
          <ul className="mt-1 space-y-0.5">
            {cluster.points.slice(0, 5).map(p => (
              <li key={p.id} className="text-[11px] text-zinc-400 truncate">
                {p.title}
              </li>
            ))}
          </ul>
          {count > 5 && (
            <div className="text-[10px] text-zinc-500 mt-0.5">+{count - 5} more</div>
          )}
        </>
      )}
    </div>
  );
}

function MapLegend({ points }: { points: GeoPoint[] }) {
  const counts = new Map<string, number>();
  for (const p of points) {
    const key = p.stance ?? 'none';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const labels: Record<string, string> = {
    supports: 'Supports',
    refutes: 'Refutes',
    neutral: 'Neutral',
    none: 'No stance',
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-zinc-400">
      {[...counts.entries()].map(([stance, count]) => (
        <span key={stance} className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: STANCE_COLORS[stance] }}
          />
          {labels[stance] ?? stance}
          <span className="text-zinc-600 tabular-nums">({count})</span>
        </span>
      ))}
      <span className="ml-auto text-zinc-600">
        {points.length} geolocated
      </span>
    </div>
  );
}

function formatExtent(bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }): string {
  const latSpan = bounds.maxLat - bounds.minLat;
  const lonSpan = bounds.maxLon - bounds.minLon;
  return `${latSpan.toFixed(1)}° × ${lonSpan.toFixed(1)}°`;
}
