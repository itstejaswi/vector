/**
 * Global flight search.
 *
 * The map feed only ever sees aircraft inside the current radius, so finding a
 * specific flight anywhere on Earth needs a different call. airplanes.live
 * exposes three lookup endpoints beside the /point one the feed already uses,
 * and they carry the same `access-control-allow-origin: *` header, so no key
 * or proxy is involved and nothing here costs anything to run.
 */

const API = "https://api.airplanes.live/v2";

/** Airline callsign: 2-3 letters then a flight number, e.g. "IGO074". */
const CALLSIGN_RE = /^[A-Z]{2,3}[0-9][0-9A-Z]{0,3}$/;

/** ICAO 24-bit address as hex, e.g. "8015cb". */
const HEX_RE = /^[0-9A-F]{6}$/;

/**
 * Tail number. Formats vary widely by country (N12345, VT-IBQ, G-EUPT,
 * D-AIMA), so this stays loose on shape but insists on one of two markers: a
 * digit, or a hyphen. Without that guard the pattern swallows ordinary words —
 * "MUMBAI" and "DEL" both matched during testing, which would have fired a
 * pointless lookup on every place name typed.
 */
const REG_RE = /^(?=.*[0-9-])[A-Z0-9]{1,3}-?[A-Z0-9]{1,5}$/;

export type FlightQueryKind = "callsign" | "registration" | "hex";

export interface FlightHit {
  hex: string;
  callsign?: string;
  registration?: string;
  typeCode?: string;
  typeName?: string;
  lat: number;
  lon: number;
  altitude: number | null;
  onGround: boolean;
}

/** Raw record from airplanes.live (the subset used here). */
interface RawAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
}

/**
 * Decide which endpoints a query could match, most likely first.
 *
 * The patterns overlap by design: "N12345" is a plausible registration, and
 * six-character hex like "8015CB" also looks like one. Rather than guess, the
 * caller tries each in turn and takes the first hit.
 */
export function queryKinds(raw: string): FlightQueryKind[] {
  const q = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!q) return [];
  const kinds: FlightQueryKind[] = [];
  if (CALLSIGN_RE.test(q)) kinds.push("callsign");
  if (REG_RE.test(q) && !kinds.includes("registration")) kinds.push("registration");
  if (HEX_RE.test(q)) kinds.push("hex");
  return kinds;
}

/** True when a query is worth sending to the flight endpoints at all. */
export function looksLikeFlight(raw: string): boolean {
  return queryKinds(raw).length > 0;
}

function toHit(raw: RawAircraft): FlightHit | null {
  // A record without a position can't be flown to, so it's not a usable hit.
  if (!raw.hex || typeof raw.lat !== "number" || typeof raw.lon !== "number") {
    return null;
  }
  const onGround = raw.alt_baro === "ground";
  return {
    hex: raw.hex,
    callsign: raw.flight?.replace(/[@_]/g, "").trim() || undefined,
    registration: raw.r,
    typeCode: raw.t,
    typeName: raw.desc,
    lat: raw.lat,
    lon: raw.lon,
    altitude: onGround ? null : (raw.alt_baro as number | undefined) ?? null,
    onGround,
  };
}

const PATH: Record<FlightQueryKind, string> = {
  callsign: "callsign",
  registration: "reg",
  hex: "hex",
};

/**
 * Look up a single flight by callsign, registration or ICAO hex.
 *
 * Returns null when the aircraft isn't currently being tracked — which is the
 * normal case for a flight that has landed or is over an area with no
 * receiver coverage, not an error.
 */
export async function searchFlight(
  query: string,
  signal?: AbortSignal,
): Promise<FlightHit | null> {
  const q = query.trim().toUpperCase().replace(/\s+/g, "");
  const kinds = queryKinds(q);
  if (kinds.length === 0) return null;

  for (const kind of kinds) {
    if (signal?.aborted) return null;
    try {
      const res = await fetch(`${API}/${PATH[kind]}/${encodeURIComponent(q)}`, { signal });
      if (!res.ok) continue;
      const body = (await res.json()) as { ac?: RawAircraft[] };
      for (const raw of body.ac ?? []) {
        const hit = toHit(raw);
        if (hit) return hit;
      }
    } catch (err) {
      // An abort is the caller moving on, not a failure worth reporting.
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // Otherwise fall through and try the next endpoint.
    }
  }
  return null;
}
