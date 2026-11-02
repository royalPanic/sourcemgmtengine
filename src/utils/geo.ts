import type { SourceWithAttachments, Stance } from '../types';

/** A source that carries usable coordinates. */
export interface GeoPoint {
  id: string;
  title: string;
  lat: number;
  lon: number;
  label: string | null;
  stance: Stance | null;
}

/** A rectangular window on the globe, in degrees. */
export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Metadata keys used to persist a location inside `custom_metadata`. */
export const LAT_KEY = 'lat';
export const LON_KEY = 'lon';
export const LOCATION_LABEL_KEY = 'location_label';

const MIN_SPAN_DEGREES = 1.5;
const DEFAULT_PADDING_RATIO = 0.18;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Clamps a latitude to the valid range. */
export function clampLat(lat: number): number {
  return Math.min(90, Math.max(-90, lat));
}

/** Normalises a longitude into [-180, 180). */
export function normalizeLon(lon: number): number {
  let value = lon;
  while (value < -180) value += 360;
  while (value >= 180) value -= 360;
  return value;
}

/** True when the coordinate pair is usable. */
export function isValidCoordinate(lat: unknown, lon: unknown): boolean {
  return (
    isFiniteNumber(lat) &&
    isFiniteNumber(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Reads a location out of a source's `custom_metadata` JSON string.
 *
 * Coordinates are stored as flat keys (`lat`, `lon`, `location_label`) to stay
 * within the flat `SourceCustomMetadata` shape mandated by AGENTS.md.
 */
export function readLocation(
  customMetadata: string
): { lat: number; lon: number; label: string | null } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(customMetadata);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  const lat = record[LAT_KEY];
  const lon = record[LON_KEY];
  if (!isValidCoordinate(lat, lon)) return null;

  const rawLabel = record[LOCATION_LABEL_KEY];
  const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : null;

  return { lat: lat as number, lon: lon as number, label };
}

/** Extracts every geolocated source from a list. */
export function collectGeoPoints(sources: SourceWithAttachments[]): GeoPoint[] {
  const points: GeoPoint[] = [];

  for (const source of sources) {
    const location = readLocation(source.custom_metadata);
    if (!location) continue;

    points.push({
      id: source.id,
      title: source.title,
      lat: location.lat,
      lon: location.lon,
      label: location.label,
      stance: source.stance,
    });
  }

  return points;
}

/**
 * Finds the smallest longitude arc covering every point.
 *
 * A naive min/max breaks when points straddle the antimeridian: two pins at
 * 179° and -179° are 2° apart, but min/max would produce a 358° window. This
 * sorts the longitudes and removes the largest gap instead.
 */
function minimalLonArc(longitudes: number[]): { start: number; span: number } {
  if (longitudes.length === 0) return { start: -180, span: 360 };
  if (longitudes.length === 1) return { start: longitudes[0], span: 0 };

  const sorted = [...longitudes].sort((a, b) => a - b);

  let largestGap = -1;
  let gapIndex = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = i;
    }
  }

  // The arc starts just after the largest gap.
  const start = sorted[(gapIndex + 1) % sorted.length];
  const span = 360 - largestGap;

  return { start, span };
}

/**
 * Computes the geographic window that should be shown for a set of points,
 * expanded so its aspect ratio matches the viewport.
 *
 * Matching the aspect ratio is what keeps the map undistorted: without it a
 * cluster of pins would be stretched to fill the container.
 */
export function computeBounds(
  points: GeoPoint[],
  viewport: Viewport,
  paddingRatio: number = DEFAULT_PADDING_RATIO
): GeoBounds {
  const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;

  if (points.length === 0) {
    return { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 };
  }

  const lats = points.map(p => clampLat(p.lat));
  const lons = points.map(p => normalizeLon(p.lon));

  const minLatRaw = Math.min(...lats);
  const maxLatRaw = Math.max(...lats);
  const arc = minimalLonArc(lons);

  // Start from the raw extent, then pad.
  let latSpan = maxLatRaw - minLatRaw;
  let lonSpan = arc.span;

  // A single point (or a perfectly aligned cluster) has zero extent; give it a
  // sensible minimum so the view is not infinitely zoomed.
  latSpan = Math.max(latSpan, MIN_SPAN_DEGREES);
  lonSpan = Math.max(lonSpan, MIN_SPAN_DEGREES);

  const padLat = latSpan * paddingRatio;
  const padLon = lonSpan * paddingRatio;
  latSpan += padLat * 2;
  lonSpan += padLon * 2;

  // Expand whichever dimension is deficient so the window matches the viewport.
  if (lonSpan / latSpan < aspect) {
    lonSpan = latSpan * aspect;
  } else {
    latSpan = lonSpan / aspect;
  }

  // Never exceed the globe.
  latSpan = Math.min(latSpan, 180);
  lonSpan = Math.min(lonSpan, 360);

  const centerLat = (minLatRaw + maxLatRaw) / 2;
  const centerLon = arc.start + arc.span / 2;

  let minLat = centerLat - latSpan / 2;
  let maxLat = centerLat + latSpan / 2;

  // Clamp vertically, then re-expand horizontally to preserve the aspect ratio.
  if (minLat < -90) {
    minLat = -90;
    maxLat = -90 + latSpan;
  }
  if (maxLat > 90) {
    maxLat = 90;
    minLat = 90 - latSpan;
  }

  const minLon = centerLon - lonSpan / 2;
  const maxLon = centerLon + lonSpan / 2;

  return { minLat, maxLat, minLon, maxLon };
}

/** Projects a coordinate into pixel space for the given window. */
export function project(
  lat: number,
  lon: number,
  bounds: GeoBounds,
  viewport: Viewport
): { x: number; y: number } {
  const lonSpan = bounds.maxLon - bounds.minLon || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;

  // Longitudes may sit outside [-180, 180) after antimeridian handling, so
  // shift them into the window's frame before projecting.
  let adjustedLon = lon;
  while (adjustedLon < bounds.minLon) adjustedLon += 360;
  while (adjustedLon > bounds.maxLon) adjustedLon -= 360;

  const x = ((adjustedLon - bounds.minLon) / lonSpan) * viewport.width;
  const y = ((bounds.maxLat - lat) / latSpan) * viewport.height;

  return { x, y };
}

/** Chooses a "nice" graticule step for the current zoom level. */
export function graticuleStep(spanDegrees: number): number {
  const candidates = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 45, 60, 90];
  const target = spanDegrees / 6;
  for (const step of candidates) {
    if (step >= target) return step;
  }
  return 90;
}

/** Builds the latitude/longitude grid lines for the current window. */
export function buildGraticule(bounds: GeoBounds): {
  lats: number[];
  lons: number[];
} {
  const latStep = graticuleStep(bounds.maxLat - bounds.minLat);
  const lonStep = graticuleStep(bounds.maxLon - bounds.minLon);

  const lats: number[] = [];
  const lons: number[] = [];

  const firstLat = Math.ceil(bounds.minLat / latStep) * latStep;
  for (let lat = firstLat; lat <= bounds.maxLat; lat += latStep) {
    lats.push(Number(lat.toFixed(4)));
  }

  const firstLon = Math.ceil(bounds.minLon / lonStep) * lonStep;
  for (let lon = firstLon; lon <= bounds.maxLon; lon += lonStep) {
    lons.push(Number(lon.toFixed(4)));
  }

  return { lats, lons };
}

/** Formats a coordinate pair for display, e.g. `51.51°N, 0.13°W`. */
export function formatCoordinate(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}

/** A group of pins that overlap at the current zoom level. */
export interface PinCluster {
  key: string;
  /** Centroid in pixel space. */
  x: number;
  y: number;
  points: GeoPoint[];
}

/**
 * Groups projected pins that land within `threshold` pixels of each other.
 *
 * Greedy single-pass clustering: each point joins the first cluster whose
 * centroid is close enough, otherwise it starts a new one. O(n·k) where k is
 * the cluster count, which is fine for the hundreds of sources an event
 * realistically holds.
 */
export function clusterProjected(
  projected: Array<{ point: GeoPoint; x: number; y: number }>,
  threshold = 14
): PinCluster[] {
  const clusters: PinCluster[] = [];

  for (const item of projected) {
    let target: PinCluster | null = null;

    for (const cluster of clusters) {
      if (Math.hypot(cluster.x - item.x, cluster.y - item.y) <= threshold) {
        target = cluster;
        break;
      }
    }

    if (target) {
      target.points.push(item.point);
      // Drift the centroid toward the new member so the badge stays centred.
      const count = target.points.length;
      target.x += (item.x - target.x) / count;
      target.y += (item.y - target.y) / count;
    } else {
      clusters.push({
        key: item.point.id,
        x: item.x,
        y: item.y,
        points: [item.point],
      });
    }
  }

  return clusters;
}
