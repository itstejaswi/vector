// Turn whatever the user types into a place on Earth.
//
// Accepts, in order of preference:
//   "12.9613, 74.89"      decimal coordinates (also 12.9613 74.89 / 12.9613N 74.89E)
//   "IXE" / "VOML"        IATA or ICAO airport code from the built-in table
//   "Mangaluru"           any place name, resolved via OpenStreetMap Nominatim
//
// Nominatim is only consulted when the first two fail, which keeps us well
// inside its 1 req/s fair-use policy.

import { formatLatLon } from "@shared/index.js";
import { AIRPORT_COORDS } from "../display/airportCoords.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const RECENTS_KEY = "vector.recentPlaces";
/**
 * The key this used before the rename. Read once so anyone who used the app
 * under its old name keeps their saved places; the value is rewritten under
 * the current key and the old one removed on the next save.
 */
const LEGACY_RECENTS_KEY = "skylight.recentPlaces";
const MAX_RECENTS = 8;

export interface ResolvedPlace {
  lat: number;
  lon: number;
  name: string;
  /** How we found it — drives the hint shown in the UI. */
  via: "coords" | "airport" | "geocode";
}

/**
 * Decimal coordinate pair. Handles comma or whitespace separation and an
 * optional hemisphere letter on either value.
 */
const COORD_RE =
  /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?\s*$/;

export function parseCoords(input: string): { lat: number; lon: number } | null {
  const m = COORD_RE.exec(input);
  if (!m) return null;

  let lat = Number(m[1]);
  let lon = Number(m[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const latHemi = m[2]?.toUpperCase();
  const lonHemi = m[4]?.toUpperCase();
  if (latHemi === "S") lat = -Math.abs(lat);
  if (latHemi === "N") lat = Math.abs(lat);
  if (lonHemi === "W") lon = -Math.abs(lon);
  if (lonHemi === "E") lon = Math.abs(lon);

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** Pretty-print coordinates with hemisphere letters. */
export const formatCoords = formatLatLon;

/**
 * Resolve free-form input to a location. Throws with a readable message when
 * nothing matches, so the caller can surface it directly.
 */
export async function resolvePlace(input: string): Promise<ResolvedPlace> {
  const q = input.trim();
  if (!q) throw new Error("Enter coordinates, an airport code, or a place name");

  const coords = parseCoords(q);
  if (coords) {
    return { ...coords, name: formatCoords(coords.lat, coords.lon), via: "coords" };
  }

  const code = q.toUpperCase();
  if (/^[A-Z]{3,4}$/.test(code) && AIRPORT_COORDS[code]) {
    const [lat, lon] = AIRPORT_COORDS[code];
    return { lat, lon, name: code, via: "airport" };
  }

  const url =
    `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("Location lookup unavailable — check your connection");
  }
  if (!res.ok) throw new Error("Location lookup failed");

  const hits = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;
  if (!hits.length) throw new Error(`No match for "${q}"`);

  const hit = hits[0];
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`No match for "${q}"`);
  }

  return { lat, lon, name: shortName(hit.display_name), via: "geocode" };
}

/** Nominatim returns a long administrative chain; keep the useful head. */
function shortName(displayName: string): string {
  const parts = displayName.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  return `${parts[0]}, ${parts[parts.length - 1]}`;
}

// --- browser geolocation ---

export const GEOLOCATION_SUPPORTED =
  typeof navigator !== "undefined" && "geolocation" in navigator;

/**
 * Ask the browser where we are. Requires a secure context (HTTPS or
 * localhost) and the user's explicit permission — the prompt is raised by
 * the browser, not by us. Resolves to a named place so the HUD reads
 * sensibly; the reverse-geocode is best-effort and never blocks the result.
 */
export async function locateMe(): Promise<ResolvedPlace> {
  if (!GEOLOCATION_SUPPORTED) {
    throw new Error("This browser doesn't support location");
  }

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 300_000,
    });
  }).catch((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      throw new Error("Location permission denied");
    }
    if (err.code === err.POSITION_UNAVAILABLE) {
      throw new Error("Location unavailable");
    }
    if (err.code === err.TIMEOUT) {
      throw new Error("Location request timed out");
    }
    throw new Error("Could not get your location");
  });

  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const name = await reverseName(lat, lon);
  return { lat, lon, name: name ?? formatCoords(lat, lon), via: "coords" };
}

/** Best-effort place name for coordinates. Returns null on any failure. */
async function reverseName(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `${NOMINATIM.replace("/search", "/reverse")}?lat=${lat}&lon=${lon}` +
        `&format=json&zoom=10&addressdetails=0`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const hit = (await res.json()) as { display_name?: string };
    return hit.display_name ? shortName(hit.display_name) : null;
  } catch {
    return null;
  }
}

// --- recent places ---

export interface RecentPlace {
  name: string;
  lat: number;
  lon: number;
}

export function loadRecents(): RecentPlace[] {
  try {
    // Fall back to the pre-rename key so returning users keep their history.
    const raw =
      localStorage.getItem(RECENTS_KEY) ?? localStorage.getItem(LEGACY_RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentPlace[]) : [];
  } catch {
    return [];
  }
}

export function pushRecent(place: RecentPlace): RecentPlace[] {
  const existing = loadRecents().filter(
    (p) => p.name.toLowerCase() !== place.name.toLowerCase(),
  );
  const next = [place, ...existing].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    localStorage.removeItem(LEGACY_RECENTS_KEY);
  } catch {
    // ignore
  }
  return next;
}
