// Geographic helpers shared by the feed and the map layer.

/** Squawk codes that mean hijack / radio failure / general emergency. */
export const EMERGENCY_SQUAWKS = new Set(["7500", "7600", "7700"]);

const EARTH_RADIUS_MILES = 3958.8;
const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

/** Format a coordinate pair with hemisphere letters. */
export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lon).toFixed(4)}°${ew}`;
}

/** Great-circle distance in miles. */
export function greatCircleMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return EARTH_RADIUS_MILES * centralAngle(lat1, lon1, lat2, lon2);
}

/** Great-circle distance in kilometres. */
export function greatCircleKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return EARTH_RADIUS_KM * centralAngle(lat1, lon1, lat2, lon2);
}

/** Angle subtended at the Earth's centre between two points, in radians. */
function centralAngle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const f1 = lat1 * DEG;
  const f2 = lat2 * DEG;
  const df = (lat2 - lat1) * DEG;
  const dl = (lon2 - lon1) * DEG;
  const a =
    Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Points along the great circle between two coordinates, as [lon, lat] pairs
 * ready for GeoJSON.
 *
 * `bow` lifts the path off the direct line, perpendicular to it, peaking at
 * the midpoint. On a Mercator map a true great circle between nearby points
 * is visually straight, which reads as a ruler line rather than flight over a
 * curved Earth; a modest bow restores that sense. Long routes already curve
 * strongly on their own, so the bow is tapered away as distance grows.
 */
export function greatCirclePoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  steps: number,
  bow = 0,
): [number, number][] {
  const p1 = lat1 * DEG;
  const l1 = lon1 * DEG;
  const p2 = lat2 * DEG;
  const l2 = lon2 * DEG;
  const d = centralAngle(lat1, lon1, lat2, lon2);

  if (d === 0 || !Number.isFinite(d)) {
    return [
      [lon1, lat1],
      [lon2, lat2],
    ];
  }

  // Direct vector in degrees, and its perpendicular (longitude widened by
  // latitude so the offset looks even on screen rather than in raw degrees).
  const cosLat = Math.cos(((lat1 + lat2) / 2) * DEG) || 1;
  const dxDeg = (lon2 - lon1) * cosLat;
  const dyDeg = lat2 - lat1;
  const spanDeg = Math.hypot(dxDeg, dyDeg);
  // Unit normal, pointing left of travel.
  const nx = spanDeg > 0 ? -dyDeg / spanDeg : 0;
  const ny = spanDeg > 0 ? dxDeg / spanDeg : 0;
  const amplitude = bow * spanDeg;

  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);

    let lon = Math.atan2(y, x) / DEG;
    let lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG;

    if (amplitude !== 0) {
      // sin gives a smooth rise and fall, zero at both endpoints.
      const lift = Math.sin(f * Math.PI) * amplitude;
      lat += ny * lift;
      lon += (nx * lift) / cosLat;
    }

    out.push([lon, lat]);
  }
  return out;
}

/**
 * How much bow suits a route of this length. Short hops get the most help
 * (they'd otherwise be dead straight); intercontinental routes get none,
 * since their real great circle already sweeps across the projection.
 */
export function bowForDistance(km: number): number {
  if (km <= 0) return 0;
  if (km >= 4000) return 0;
  // 0.18 at zero distance, tapering smoothly to nothing by 4000 km.
  return 0.18 * (1 - km / 4000) ** 1.4;
}

/**
 * Closed ring of [lon, lat] points at a fixed great-circle radius — used for
 * the range ring, which must bend with the projection rather than being a
 * screen-space circle.
 */
export function circlePoints(
  lat: number,
  lon: number,
  radiusMiles: number,
  steps: number,
): [number, number][] {
  const d = radiusMiles / EARTH_RADIUS_MILES;
  const latR = lat * DEG;
  const lonR = lon * DEG;
  const out: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const brg = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(brg),
    );
    const lon2 =
      lonR +
      Math.atan2(
        Math.sin(brg) * Math.sin(d) * Math.cos(latR),
        Math.cos(d) - Math.sin(latR) * Math.sin(lat2),
      );
    out.push([lon2 / DEG, lat2 / DEG]);
  }
  return out;
}

/**
 * Squared planar distance in degrees, longitude corrected for latitude. Only
 * valid for ranking nearby points, which is all we use it for.
 */
export function distSq(
  lat: number,
  lon: number,
  refLat: number,
  refLon: number,
): number {
  const dy = lat - refLat;
  const dx = (lon - refLon) * Math.cos(refLat * DEG);
  return dx * dx + dy * dy;
}
