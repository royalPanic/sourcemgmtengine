import { describe, it, expect } from 'vitest';
import {
  latLonToUtm,
  utmToLatLon,
  formatCoordinateIn,
  parseCoordinateIn,
  formatDms,
  parseDms,
  isValidLatLon,
  COORDINATE_FORMATS,
} from './coordinates';

/**
 * Reference values generated with pyproj 3.8.0 (EPSG:4326 -> EPSG:326xx/327xx),
 * which is the authoritative implementation. Any drift here means the
 * hand-rolled Snyder formulas have regressed.
 */
const REFERENCE = [
  { name: 'London', lat: 51.5074, lon: -0.1278, zone: 30, hemi: 'N', e: 699316, n: 5710164 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, zone: 56, hemi: 'S', e: 334369, n: 6250948 },
  { name: 'New York', lat: 40.7128, lon: -74.006, zone: 18, hemi: 'N', e: 583959, n: 4507351 },
  { name: 'Equator', lat: 0, lon: 0, zone: 31, hemi: 'N', e: 166021, n: 0 },
  { name: 'Cape Town', lat: -33.9249, lon: 18.4241, zone: 34, hemi: 'S', e: 261882, n: 6243182 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503, zone: 54, hemi: 'N', e: 377856, n: 3948874 },
  { name: 'Reykjavik', lat: 64.1466, lon: -21.9426, zone: 27, hemi: 'N', e: 454138, n: 7113690 },
  { name: 'Quito', lat: -0.1807, lon: -78.4678, zone: 17, hemi: 'S', e: 781861, n: 9980008 },
  { name: 'Anchorage', lat: 61.2181, lon: -149.9003, zone: 6, hemi: 'N', e: 344247, n: 6790537 },
  { name: 'Perth', lat: -31.9505, lon: 115.8605, zone: 50, hemi: 'S', e: 392307, n: 6464484 },
];

describe('UTM forward conversion', () => {
  for (const c of REFERENCE) {
    it(`matches pyproj for ${c.name}`, () => {
      const utm = latLonToUtm(c.lat, c.lon);
      expect(utm.zone).toBe(c.zone);
      expect(utm.hemisphere).toBe(c.hemi);
      // Sub-metre agreement with the reference implementation.
      expect(Math.abs(utm.easting - c.e)).toBeLessThan(1);
      expect(Math.abs(utm.northing - c.n)).toBeLessThan(1);
    });
  }
});

describe('UTM round-trip', () => {
  for (const c of REFERENCE) {
    it(`returns the original point for ${c.name}`, () => {
      const utm = latLonToUtm(c.lat, c.lon);
      const back = utmToLatLon(utm.zone, utm.hemisphere, utm.easting, utm.northing);
      expect(back.lat).toBeCloseTo(c.lat, 6);
      expect(back.lon).toBeCloseTo(c.lon, 6);
    });
  }
});

describe('format round-trips', () => {
  const samples = [
    { lat: 51.5074, lon: -0.1278 },
    { lat: -33.8688, lon: 151.2093 },
    { lat: 0, lon: 0 },
    { lat: 35.6762, lon: 139.6503 },
  ];

  for (const format of COORDINATE_FORMATS) {
    for (const s of samples) {
      it(`${format} survives ${s.lat},${s.lon}`, () => {
        const text = formatCoordinateIn(s.lat, s.lon, format);
        const parsed = parseCoordinateIn(text, format);
        expect(parsed).not.toBeNull();
        // MGRS is grid-based, so allow ~1 m of quantisation.
        expect(parsed!.lat).toBeCloseTo(s.lat, 4);
        expect(parsed!.lon).toBeCloseTo(s.lon, 4);
      });
    }
  }
});

describe('decimal degrees', () => {
  it('formats to six decimal places', () => {
    expect(formatCoordinateIn(51.5074, -0.1278, 'dd')).toBe('51.507400, -0.127800');
  });

  it('accepts comma and space separators', () => {
    expect(parseCoordinateIn('51.5074, -0.1278', 'dd')).toEqual({ lat: 51.5074, lon: -0.1278 });
    expect(parseCoordinateIn('51.5074 -0.1278', 'dd')).toEqual({ lat: 51.5074, lon: -0.1278 });
  });

  it('rejects malformed input', () => {
    expect(parseCoordinateIn('51.5074', 'dd')).toBeNull();
    expect(parseCoordinateIn('abc, def', 'dd')).toBeNull();
    expect(parseCoordinateIn('', 'dd')).toBeNull();
  });
});

describe('DMS', () => {
  it('formats hemispheres correctly', () => {
    expect(formatDms(51.5074, -0.1278)).toBe(`51°30'26.6"N 0°07'40.1"W`);
    expect(formatDms(-33.8688, 151.2093)).toBe(`33°52'07.7"S 151°12'33.5"E`);
  });

  it('parses common shapes', () => {
    const parsed = parseDms(`51°30'26.6"N 0°07'40.1"W`);
    expect(parsed).not.toBeNull();
    expect(parsed!.lat).toBeCloseTo(51.5074, 4);
    expect(parsed!.lon).toBeCloseTo(-0.1278, 4);
    expect(parseDms('51 30 26.6 N, 0 7 40.1 W')).not.toBeNull();
  });

  it('handles the poles without producing 60 seconds', () => {
    const text = formatDms(89.99999, 179.99999);
    expect(text).not.toContain(`60.0"`);
    const parsed = parseDms(text);
    expect(parsed!.lat).toBeCloseTo(89.99999, 4);
  });

  it('rejects input missing a hemisphere', () => {
    expect(parseDms('51 30 26.6')).toBeNull();
  });
});

describe('UTM parsing', () => {
  it('accepts the formatted shape', () => {
    const text = formatCoordinateIn(51.5074, -0.1278, 'utm');
    const parsed = parseCoordinateIn(text, 'utm');
    expect(parsed).not.toBeNull();
    expect(parsed!.lat).toBeCloseTo(51.5074, 4);
    expect(parsed!.lon).toBeCloseTo(-0.1278, 4);
  });

  it('rejects an out-of-range zone', () => {
    expect(parseCoordinateIn('99N 500000E 5000000N', 'utm')).toBeNull();
  });
});

describe('MGRS', () => {
  it('produces a 5-digit precision string', () => {
    const text = formatCoordinateIn(51.5074, -0.1278, 'mgrs');
    expect(text).toMatch(/^30U/);
    expect(text.replace(/\s/g, '').length).toBe(15);
  });

  it('rejects garbage', () => {
    expect(parseCoordinateIn('not mgrs', 'mgrs')).toBeNull();
  });
});
describe('isValidLatLon', () => {
  it('accepts in-range values', () => {
    expect(isValidLatLon(0, 0)).toBe(true);
    expect(isValidLatLon(90, 180)).toBe(true);
    expect(isValidLatLon(-90, -180)).toBe(true);
  });

  it('rejects out-of-range and non-finite values', () => {
    expect(isValidLatLon(91, 0)).toBe(false);
    expect(isValidLatLon(0, 181)).toBe(false);
    expect(isValidLatLon(NaN, 0)).toBe(false);
    expect(isValidLatLon(Infinity, 0)).toBe(false);
  });
});
