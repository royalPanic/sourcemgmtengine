import { describe, it, expect } from 'vitest';
import {
  computeBounds,
  project,
  collectGeoPoints,
  readLocation,
  isValidCoordinate,
  normalizeLon,
  clampLat,
  graticuleStep,
  buildGraticule,
  formatCoordinate,
  clusterProjected,
  type GeoPoint,
} from './geo';
import type { SourceWithAttachments } from '../types';

const VIEWPORT = { width: 800, height: 400 }; // aspect 2:1

function point(lat: number, lon: number, id = 'p'): GeoPoint {
  return { id, title: id, lat, lon, label: null, stance: null };
}

function sourceWithMeta(meta: Record<string, unknown>): SourceWithAttachments {
  return {
    id: 's1',
    case_id: 'c1',
    title: 'Source',
    source_type: 'URL',
    url: null,
    raw_text: null,
    reliability_code: null,
    credibility_code: null,
    stance: null,
    custom_metadata: JSON.stringify(meta),
    created_at: '',
    updated_at: '',
    attachments: [],
  };
}

describe('coordinate validation', () => {
  it('accepts valid coordinates', () => {
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(90, 180)).toBe(true);
    expect(isValidCoordinate(-90, -180)).toBe(true);
  });

  it('rejects out-of-range and non-numeric values', () => {
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
    expect(isValidCoordinate(NaN, 0)).toBe(false);
    expect(isValidCoordinate('51', 0)).toBe(false);
    expect(isValidCoordinate(null, 0)).toBe(false);
  });

  it('clamps latitude and normalises longitude', () => {
    expect(clampLat(120)).toBe(90);
    expect(clampLat(-120)).toBe(-90);
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(-190)).toBe(170);
    expect(normalizeLon(180)).toBe(-180);
  });
});

describe('readLocation', () => {
  it('reads flat lat/lon keys', () => {
    const result = readLocation(JSON.stringify({ lat: 51.5, lon: -0.12, location_label: 'London' }));
    expect(result).toEqual({ lat: 51.5, lon: -0.12, label: 'London' });
  });

  it('returns null when coordinates are missing or invalid', () => {
    expect(readLocation('{}')).toBeNull();
    expect(readLocation(JSON.stringify({ lat: 51.5 }))).toBeNull();
    expect(readLocation(JSON.stringify({ lat: 999, lon: 0 }))).toBeNull();
    expect(readLocation('not json')).toBeNull();
  });

  it('treats a blank label as absent', () => {
    const result = readLocation(JSON.stringify({ lat: 1, lon: 2, location_label: '   ' }));
    expect(result?.label).toBeNull();
  });
});

describe('collectGeoPoints', () => {
  it('keeps only geolocated sources', () => {
    const sources = [
      sourceWithMeta({ lat: 10, lon: 20 }),
      sourceWithMeta({}),
      sourceWithMeta({ lat: 30, lon: 40 }),
    ];
    expect(collectGeoPoints(sources)).toHaveLength(2);
  });
});

describe('computeBounds', () => {
  it('returns the whole globe when there are no points', () => {
    const bounds = computeBounds([], VIEWPORT);
    expect(bounds).toEqual({ minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 });
  });

  it('gives a single point a sensible minimum window', () => {
    const bounds = computeBounds([point(51.5, -0.12)], VIEWPORT);
    const latSpan = bounds.maxLat - bounds.minLat;
    const lonSpan = bounds.maxLon - bounds.minLon;

    expect(latSpan).toBeGreaterThan(0);
    expect(lonSpan).toBeGreaterThan(0);
    // The point must be inside the window.
    expect(bounds.minLat).toBeLessThan(51.5);
    expect(bounds.maxLat).toBeGreaterThan(51.5);
    expect(bounds.minLon).toBeLessThan(-0.12);
    expect(bounds.maxLon).toBeGreaterThan(-0.12);
  });

  it('matches the viewport aspect ratio', () => {
    const bounds = computeBounds(
      [point(51.5, -0.12), point(48.8, 2.35)],
      VIEWPORT
    );
    const latSpan = bounds.maxLat - bounds.minLat;
    const lonSpan = bounds.maxLon - bounds.minLon;

    expect(lonSpan / latSpan).toBeCloseTo(VIEWPORT.width / VIEWPORT.height, 5);
  });

  it('contains every point', () => {
    const points = [point(51.5, -0.12), point(48.8, 2.35), point(40.7, -74)];
    const bounds = computeBounds(points, VIEWPORT);

    for (const p of points) {
      expect(p.lat).toBeGreaterThanOrEqual(bounds.minLat);
      expect(p.lat).toBeLessThanOrEqual(bounds.maxLat);
      expect(p.lon).toBeGreaterThanOrEqual(bounds.minLon);
      expect(p.lon).toBeLessThanOrEqual(bounds.maxLon);
    }
  });

  it('crops tightly around a tight cluster', () => {
    // Three pins within ~0.1 degrees should produce a small window.
    const points = [point(51.50, -0.12), point(51.51, -0.11), point(51.52, -0.13)];
    const bounds = computeBounds(points, VIEWPORT);
    const latSpan = bounds.maxLat - bounds.minLat;

    // Far smaller than a country, but not degenerate.
    expect(latSpan).toBeLessThan(5);
    expect(latSpan).toBeGreaterThan(0);
  });

  it('handles the antimeridian without spanning the globe', () => {
    // 179E and 179W are 2 degrees apart, not 358.
    const bounds = computeBounds([point(0, 179), point(0, -179)], VIEWPORT);
    const lonSpan = bounds.maxLon - bounds.minLon;

    expect(lonSpan).toBeLessThan(20);
  });

  it('never exceeds the globe', () => {
    const bounds = computeBounds(
      [point(-89, -179), point(89, 179)],
      VIEWPORT
    );
    expect(bounds.maxLat - bounds.minLat).toBeLessThanOrEqual(180);
    expect(bounds.maxLon - bounds.minLon).toBeLessThanOrEqual(360);
  });

  it('keeps the window inside the poles', () => {
    const bounds = computeBounds([point(89.9, 0)], VIEWPORT);
    expect(bounds.maxLat).toBeLessThanOrEqual(90);
    expect(bounds.minLat).toBeGreaterThanOrEqual(-90);
  });
});

describe('project', () => {
  it('maps the window corners to the viewport corners', () => {
    const bounds = { minLat: 40, maxLat: 60, minLon: -10, maxLon: 10 };

    const topLeft = project(60, -10, bounds, VIEWPORT);
    expect(topLeft.x).toBeCloseTo(0, 5);
    expect(topLeft.y).toBeCloseTo(0, 5);

    const bottomRight = project(40, 10, bounds, VIEWPORT);
    expect(bottomRight.x).toBeCloseTo(VIEWPORT.width, 5);
    expect(bottomRight.y).toBeCloseTo(VIEWPORT.height, 5);
  });

  it('places the centre in the middle', () => {
    const bounds = { minLat: 40, maxLat: 60, minLon: -10, maxLon: 10 };
    const centre = project(50, 0, bounds, VIEWPORT);

    expect(centre.x).toBeCloseTo(VIEWPORT.width / 2, 5);
    expect(centre.y).toBeCloseTo(VIEWPORT.height / 2, 5);
  });

  it('keeps every point inside the viewport after auto-fit', () => {
    const points = [point(51.5, -0.12), point(48.8, 2.35), point(40.7, -74)];
    const bounds = computeBounds(points, VIEWPORT);

    for (const p of points) {
      const { x, y } = project(p.lat, p.lon, bounds, VIEWPORT);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(VIEWPORT.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });

  it('projects antimeridian points into the window', () => {
    const bounds = computeBounds([point(0, 179), point(0, -179)], VIEWPORT);

    for (const lon of [179, -179]) {
      const { x } = project(0, lon, bounds, VIEWPORT);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(VIEWPORT.width);
    }
  });
});

describe('graticule', () => {
  it('picks coarser steps as the window widens', () => {
    expect(graticuleStep(2)).toBeLessThan(graticuleStep(180));
  });

  it('produces lines inside the window', () => {
    const bounds = { minLat: 40, maxLat: 60, minLon: -10, maxLon: 10 };
    const { lats, lons } = buildGraticule(bounds);

    expect(lats.length).toBeGreaterThan(0);
    expect(lons.length).toBeGreaterThan(0);
    for (const lat of lats) {
      expect(lat).toBeGreaterThanOrEqual(bounds.minLat);
      expect(lat).toBeLessThanOrEqual(bounds.maxLat);
    }
  });
});

describe('formatCoordinate', () => {
  it('formats hemispheres', () => {
    expect(formatCoordinate(51.5, -0.12)).toBe('51.50°N, 0.12°W');
    expect(formatCoordinate(-33.87, 151.21)).toBe('33.87°S, 151.21°E');
  });
});

describe('clusterProjected', () => {
  const at = (id: string, x: number, y: number) => ({
    point: point(0, 0, id),
    x,
    y,
  });

  it('keeps well-separated pins as individual clusters', () => {
    const clusters = clusterProjected([at('a', 0, 0), at('b', 100, 100), at('c', 200, 0)]);
    expect(clusters).toHaveLength(3);
    expect(clusters.every(c => c.points.length === 1)).toBe(true);
  });

  it('merges pins within the threshold', () => {
    const clusters = clusterProjected([at('a', 0, 0), at('b', 5, 5)]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].points.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('respects a custom threshold', () => {
    const pins = [at('a', 0, 0), at('b', 20, 0)];
    expect(clusterProjected(pins, 14)).toHaveLength(2);
    expect(clusterProjected(pins, 25)).toHaveLength(1);
  });

  it('centres the cluster on its members', () => {
    const clusters = clusterProjected([at('a', 0, 0), at('b', 10, 0)]);
    expect(clusters[0].x).toBeCloseTo(5, 6);
    expect(clusters[0].y).toBeCloseTo(0, 6);
  });

  it('uses the first point id as the cluster key', () => {
    const clusters = clusterProjected([at('first', 0, 0), at('second', 2, 2)]);
    expect(clusters[0].key).toBe('first');
  });

  it('does not chain distant pins through a shared neighbour', () => {
    // a-b and b-c are each within 14px, but a-c are 28px apart. Greedy
    // clustering joins b to a, then c is too far from the a/b centroid.
    const clusters = clusterProjected([at('a', 0, 0), at('b', 14, 0), at('c', 28, 0)]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].points.map(p => p.id)).toEqual(['a', 'b']);
    expect(clusters[1].points.map(p => p.id)).toEqual(['c']);
  });

  it('handles an empty input', () => {
    expect(clusterProjected([])).toEqual([]);
  });
});
