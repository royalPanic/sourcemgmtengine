import { forward as mgrsForward, toPoint as mgrsToPoint } from 'mgrs';

/** The coordinate notations the UI can display and accept. */
export type CoordinateFormat = 'dd' | 'dms' | 'utm' | 'mgrs';

export const COORDINATE_FORMATS: CoordinateFormat[] = ['dd', 'dms', 'utm', 'mgrs'];

export const FORMAT_LABELS: Record<CoordinateFormat, string> = {
  dd: 'Decimal',
  dms: 'DMS',
  utm: 'UTM',
  mgrs: 'MGRS',
};

export const FORMAT_HINTS: Record<CoordinateFormat, string> = {
  dd: '51.507400, -0.127800',
  dms: `51°30'26.6"N 0°07'40.1"W`,
  utm: '30N 699460E 5710158N',
  mgrs: '30U XC 99460 10158',
};

// WGS84 ellipsoid constants.
const SEMI_MAJOR = 6378137.0;
const FLATTENING = 1 / 298.257223563;
const ECC_SQ = FLATTENING * (2 - FLATTENING);
const K0 = 0.9996;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface UtmCoordinate {
  zone: number;
  hemisphere: 'N' | 'S';
  easting: number;
  northing: number;
}

/** Converts WGS84 lat/lon to UTM (Snyder, Map Projections §8). */
export function latLonToUtm(lat: number, lon: number): UtmCoordinate {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const lonOrigin = (zone - 1) * 6 - 180 + 3;

  const latRad = lat * DEG;
  const dLon = (lon - lonOrigin) * DEG;

  const ep2 = ECC_SQ / (1 - ECC_SQ);
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);

  const n = SEMI_MAJOR / Math.sqrt(1 - ECC_SQ * sinLat * sinLat);
  const t = tanLat * tanLat;
  const c = ep2 * cosLat * cosLat;
  const a = cosLat * dLon;

  const m =
    SEMI_MAJOR *
    ((1 - ECC_SQ / 4 - (3 * ECC_SQ ** 2) / 64 - (5 * ECC_SQ ** 3) / 256) * latRad -
      ((3 * ECC_SQ) / 8 + (3 * ECC_SQ ** 2) / 32 + (45 * ECC_SQ ** 3) / 1024) * Math.sin(2 * latRad) +
      ((15 * ECC_SQ ** 2) / 256 + (45 * ECC_SQ ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * ECC_SQ ** 3) / 3072) * Math.sin(6 * latRad));

  const easting =
    K0 *
      n *
      (a +
        ((1 - t + c) * a ** 3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * a ** 5) / 120) +
    500000;

  let northing =
    K0 *
    (m +
      n *
        tanLat *
        ((a * a) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * a ** 6) / 720));

  if (lat < 0) northing += 10000000;

  return { zone, hemisphere: lat >= 0 ? 'N' : 'S', easting, northing };
}

/** Converts UTM back to WGS84 lat/lon. */
export function utmToLatLon(
  zone: number,
  hemisphere: 'N' | 'S',
  easting: number,
  northing: number
): { lat: number; lon: number } {
  const ep2 = ECC_SQ / (1 - ECC_SQ);
  const e1 = (1 - Math.sqrt(1 - ECC_SQ)) / (1 + Math.sqrt(1 - ECC_SQ));

  const x = easting - 500000;
  const y = hemisphere === 'S' ? northing - 10000000 : northing;

  const m = y / K0;
  const mu = m / (SEMI_MAJOR * (1 - ECC_SQ / 4 - (3 * ECC_SQ ** 2) / 64 - (5 * ECC_SQ ** 3) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const n1 = SEMI_MAJOR / Math.sqrt(1 - ECC_SQ * sinPhi1 * sinPhi1);
  const t1 = tanPhi1 * tanPhi1;
  const c1 = ep2 * cosPhi1 * cosPhi1;
  const r1 = (SEMI_MAJOR * (1 - ECC_SQ)) / (1 - ECC_SQ * sinPhi1 * sinPhi1) ** 1.5;
  const d = x / (n1 * K0);

  const lat =
    phi1 -
    ((n1 * tanPhi1) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720);

  const lon =
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) /
    cosPhi1;

  return {
    lat: lat * RAD,
    lon: (zone - 1) * 6 - 180 + 3 + lon * RAD,
  };
}

/** Formats a hemisphere-signed value as degrees, minutes, seconds. */
function dmsPart(value: number, positive: string, negative: string): string {
  const direction = value >= 0 ? positive : negative;
  const abs = Math.abs(value);

  let degrees = Math.floor(abs);
  let minutes = Math.floor((abs - degrees) * 60);
  let seconds = ((abs - degrees) * 60 - minutes) * 60;

  // Guard against 59.95" rounding up to 60.0".
  if (Number(seconds.toFixed(1)) >= 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes = 0;
    degrees += 1;
  }

  return `${degrees}°${String(minutes).padStart(2, '0')}'${seconds
    .toFixed(1)
    .padStart(4, '0')}"${direction}`;
}

/** `51°30'26.6"N 0°07'40.1"W` */
export function formatDms(lat: number, lon: number): string {
  return `${dmsPart(lat, 'N', 'S')} ${dmsPart(lon, 'E', 'W')}`;
}

/** Parses DMS in a range of common shapes. */
export function parseDms(input: string): { lat: number; lon: number } | null {
  const pattern =
    /(-?\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*'?\s*)?(?:(\d+(?:\.\d+)?)\s*"?\s*)?([NSEW])/gi;

  const found: Array<{ value: number; direction: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const [, deg, min, sec, dir] = match;
    const magnitude =
      Math.abs(Number(deg)) + (min ? Number(min) / 60 : 0) + (sec ? Number(sec) / 3600 : 0);
    found.push({ value: magnitude, direction: dir.toUpperCase() });
  }

  if (found.length !== 2) return null;

  const latEntry = found.find(f => f.direction === 'N' || f.direction === 'S');
  const lonEntry = found.find(f => f.direction === 'E' || f.direction === 'W');
  if (!latEntry || !lonEntry) return null;

  const lat = latEntry.direction === 'S' ? -latEntry.value : latEntry.value;
  const lon = lonEntry.direction === 'W' ? -lonEntry.value : lonEntry.value;

  return { lat, lon };
}

/** Renders a coordinate pair in the requested notation. */
export function formatCoordinateIn(
  lat: number,
  lon: number,
  format: CoordinateFormat
): string {
  switch (format) {
    case 'dd':
      return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    case 'dms':
      return formatDms(lat, lon);
    case 'utm': {
      const utm = latLonToUtm(lat, lon);
      return `${utm.zone}${utm.hemisphere} ${Math.round(utm.easting)}E ${Math.round(
        utm.northing
      )}N`;
    }
    case 'mgrs':
      return mgrsForward([lon, lat], 5);
  }
}

/** Parses a coordinate string in the given notation back to decimal degrees. */
export function parseCoordinateIn(
  input: string,
  format: CoordinateFormat
): { lat: number; lon: number } | null {
  const text = input.trim();
  if (!text) return null;

  try {
    switch (format) {
      case 'dd': {
        const parts = text.split(/[,\s]+/).filter(Boolean).map(Number);
        if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
        return { lat: parts[0], lon: parts[1] };
      }
      case 'dms':
        return parseDms(text);
      case 'utm': {
        const match = text.match(
          /^(\d{1,2})\s*([NS])?\s+(\d+(?:\.\d+)?)\s*E?\s+(\d+(?:\.\d+)?)\s*N?$/i
        );
        if (!match) return null;
        const zone = Number(match[1]);
        if (zone < 1 || zone > 60) return null;
        const hemisphere = (match[2]?.toUpperCase() ?? 'N') as 'N' | 'S';
        return utmToLatLon(zone, hemisphere, Number(match[3]), Number(match[4]));
      }
      case 'mgrs': {
        const [lon, lat] = mgrsToPoint(text);
        return { lat, lon };
      }
    }
  } catch {
    return null;
  }
}

/** True when the pair is a usable WGS84 coordinate. */
export function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}
