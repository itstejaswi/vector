// Runtime configuration. Small on purpose: this is only what the map-based
// tracker actually reads, persisted to localStorage and sanitised on the way
// back in.

export type DataSource = "radio" | "api";
/** Ground-speed display unit. ADS-B reports knots; the rest are converted. */
export type SpeedUnit = "kt" | "mph" | "kmh";

export interface Config {
  /** View centre. */
  centerLat: number;
  centerLon: number;
  /** Human-readable name for the centre, shown in the HUD. */
  locationName: string;
  /** Search radius in miles (clamped to MIN/MAX below). */
  radiusMiles: number;
  /** Colour aircraft glyphs and trails by altitude band. */
  altitudeColor: boolean;
  /** Unit for the speed shown on labels. */
  speedUnit: SpeedUnit;
}

export const DEFAULT_CONFIG: Config = {
  // Delhi, wide enough to catch cruising traffic with real route data.
  // Change it to anywhere on Earth from the location box.
  centerLat: 28.5744,
  centerLon: 77.0835,
  locationName: "Delhi (DEL)",
  radiusMiles: 60,
  altitudeColor: true,
  speedUnit: "kmh",
};

// --- guard rails -----------------------------------------------------------

/** Upper bound on the search radius, in kilometres. */
export const MAX_RADIUS_KM = 200;
/** Lower bound, in kilometres — below this the view is uselessly tight. */
export const MIN_RADIUS_KM = 5;

export const KM_PER_MILE = 1.609344;
export const MAX_RADIUS_MILES = MAX_RADIUS_KM / KM_PER_MILE; // ~124.3
export const MIN_RADIUS_MILES = MIN_RADIUS_KM / KM_PER_MILE; // ~3.1

export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE;
}

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Normalise longitude to [-180, 180]. Values already in range are returned
 * untouched — running them through modular arithmetic introduces float drift
 * (77.0835 would come back as 77.08349999999996).
 */
function wrapLongitude(lon: number): number {
  if (lon >= -180 && lon <= 180) return lon;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Force a config into valid ranges. Persisted state comes from localStorage,
 * which the user (or a stale build) can leave corrupt — a NaN centre or a
 * 5000-mile radius would otherwise produce an unusable view or an API error.
 */
export function sanitizeConfig(cfg: Config): Config {
  return {
    ...cfg,
    centerLat: Number.isFinite(cfg.centerLat)
      ? clamp(cfg.centerLat, -90, 90)
      : DEFAULT_CONFIG.centerLat,
    centerLon: Number.isFinite(cfg.centerLon)
      ? wrapLongitude(cfg.centerLon)
      : DEFAULT_CONFIG.centerLon,
    radiusMiles: Number.isFinite(cfg.radiusMiles)
      ? clamp(cfg.radiusMiles, MIN_RADIUS_MILES, MAX_RADIUS_MILES)
      : DEFAULT_CONFIG.radiusMiles,
    locationName:
      typeof cfg.locationName === "string" ? cfg.locationName : "",
  };
}

/** Merge a partial config onto a base, then bring it back into range. */
export function mergeConfig(base: Config, patch: Partial<Config>): Config {
  return sanitizeConfig({ ...base, ...patch });
}
