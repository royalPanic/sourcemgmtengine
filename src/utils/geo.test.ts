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
  ringToPath,
  type GeoPoint,
} from './geo';
import { WORLD_RINGS } from './worldOutline';
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

describe('ringToPath', () => {
  const WORLD = { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 };

  function parsePath(d: string): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    for (const m of d.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)) pts.push([+m[1], +m[2]]);
    return pts;
  }

  function inside(x: number, y: number, poly: Array<[number, number]>): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y)) {
        const xInt = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (x < xInt) hit = !hit;
      }
    }
    return hit;
  }

  /** True when the projected land covers the given coordinate. */
  function landAt(
    lat: number,
    lon: number,
    bounds: typeof WORLD,
    viewport: { width: number; height: number }
  ): boolean {
    const { x, y } = project(lat, lon, bounds, viewport);
    return WORLD_RINGS.map(r => ringToPath(r, bounds, viewport))
      .filter(d => d !== '')
      .some(d => inside(x, y, parsePath(d)));
  }

  it('emits a closed path for every ring', () => {
    for (const ring of WORLD_RINGS) {
      const d = ringToPath(ring, WORLD, VIEWPORT);
      expect(d).not.toBe('');
      expect(d.trimEnd().endsWith('Z')).toBe(true);
    }
  });

  it('covers land and excludes ocean on a world view', () => {
    const probes: Array<[string, number, number, boolean]> = [
      ['London', 51.5, -0.13, true],
      ['Sahara', 23, 10, true],
      ['Amazon', -5, -60, true],
      ['Australia', -25, 134, true],
      ['Siberia', 65, 100, true],
      ['Greenland', 72, -42, true],
      ['Antarctica', -85, 0, true],
      ['Mid-Atlantic', 30, -30, false],
      ['Pacific', 0, -140, false],
      ['Indian Ocean', -20, 80, false],
      ['Arctic Ocean', 88, 0, false],
      ['Southern Ocean', -60, 0, false],
    ];

    for (const [name, lat, lon, expected] of probes) {
      expect(landAt(lat, lon, WORLD, VIEWPORT), name).toBe(expected);
    }
  });

  it('keeps coastal cities on land when cropped to a region', () => {
    const regions: Array<[string, Array<[number, number]>, Array<[string, number, number, boolean]>]> = [
      ['W Europe', [[51.5, -0.13], [48.85, 2.35], [40.4, -3.7]], [
        ['London', 51.5, -0.13, true],
        ['Paris', 48.85, 2.35, true],
        ['Madrid', 40.4, -3.7, true],
        ['Bay of Biscay', 45, -6, false],
        ['English Channel', 50.2, -0.5, false],
      ]],
      ['E Asia', [[35.68, 139.65], [37.57, 126.98], [31.23, 121.47]], [
        ['Tokyo', 35.68, 139.65, true],
        ['Seoul', 37.57, 126.98, true],
        ['Shanghai', 31.23, 121.47, true],
        ['Sea of Japan', 39, 134, false],
        ['Yellow Sea', 35, 123, false],
      ]],
      ['US East', [[40.71, -74], [38.9, -77.04], [42.36, -71.06]], [
        ['New York', 40.71, -74, true],
        ['Washington', 38.9, -77.04, true],
        ['Boston', 42.36, -71.06, true],
        ['Atlantic', 39.5, -71, false],
      ]],
      ['Australia', [[-33.87, 151.21], [-37.81, 144.96], [-27.47, 153.03]], [
        ['Sydney', -33.87, 151.21, true],
        ['Melbourne', -37.81, 144.96, true],
        ['Brisbane', -27.47, 153.03, true],
        ['Tasman Sea', -35, 156, false],
      ]],
    ];

    for (const [region, pins, probes] of regions) {
      const bounds = computeBounds(
        pins.map(([lat, lon], i) => point(lat, lon, `p${i}`)),
        VIEWPORT
      );

      for (const [name, lat, lon, expected] of probes) {
        const inWindow =
          lat >= bounds.minLat &&
          lat <= bounds.maxLat &&
          lon >= bounds.minLon &&
          lon <= bounds.maxLon;
        if (!inWindow) continue;

        expect(landAt(lat, lon, bounds, VIEWPORT), `${region}/${name}`).toBe(expected);
      }
    }
  });

  it('handles a ring that encircles a pole', () => {
    // Antarctica wraps the south pole; unwrapping must not drag it a full turn.
    const antarctic = WORLD_RINGS.filter(ring => {
      const lats = ring.filter((_, i) => i % 2 === 1);
      return Math.min(...lats) <= -89;
    });
    expect(antarctic.length).toBeGreaterThan(0);

    for (const ring of antarctic) {
      const d = ringToPath(ring, WORLD, VIEWPORT);
      const xs = parsePath(d).map(p => p[0]);
      // A full turn of drift would push the path far outside the viewport.
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(VIEWPORT.width * 1.5);
    }
  });

  it('returns an empty path for degenerate rings', () => {
    expect(ringToPath([], WORLD, VIEWPORT)).toBe('');
    expect(ringToPath([0, 0, 1, 1], WORLD, VIEWPORT)).toBe('');
  });
});
