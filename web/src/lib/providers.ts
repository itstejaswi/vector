// Aircraft position providers.
//
// Vector talks to whichever feed is available. That used to be a detail; it
// became the whole problem in August 2026, when every free ADS-B network
// closed browser access at roughly the same time:
//
//   airplanes.live   403 to every request, browser or not
//   adsb.lol         serves data, sends no access-control-allow-origin
//   adsb.fi          serves data, sends no access-control-allow-origin
//   OpenSky          allows only its own origin
//
// A browser cannot work around any of that: CORS is enforced by the browser
// and only the API's owner can relax it. So the feed is now pluggable, and the
// one provider still answering browsers - AirLabs - is used when the visitor
// supplies a key.
//
// Keys are supplied by the visitor and kept in their own localStorage. None is
// bundled. That is partly hygiene, and partly courtesy: this repository is
// public and permissively licensed, so a shipped key would become everyone's
// key and land the provider with traffic from every fork at once.

import type { Config } from "@shared/index.js";

/** Raw aircraft record, in the shape airplanes.live returns. */
export interface RawAircraft {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  /** Barometric altitude in feet, or "ground". */
  alt_baro?: number | "ground";
  alt_geom?: number;
  /** Ground speed in knots. */
  gs?: number;
  track?: number;
  baro_rate?: number;
  category?: string;
  r?: string;
  t?: string;
  seen?: number;
}

export interface Provider {
  readonly id: string;
  /** Shown in the HUD as the data source. */
  readonly label: string;
  /** True when the provider has everything it needs to be called. */
  ready(cfg: Config): boolean;
  /** Largest radius this provider accepts, in nautical miles. */
  readonly maxRadiusNm: number;
  url(cfg: Config, radiusNm: number): string;
  /** Map the provider's response onto the shape the rest of the app expects. */
  parse(json: unknown): RawAircraft[];
}

const M_PER_FOOT = 0.3048;
const KMH_PER_KNOT = 1.852;

/**
 * airplanes.live - the original feed.
 *
 * Kept because it needs no key and returns exactly the shape the app was built
 * around. It has been answering 403 since August 2026; if that is a temporary
 * measure rather than a policy, this starts working again on its own.
 */
export const airplanesLive: Provider = {
  id: "airplanes.live",
  label: "airplanes.live",
  ready: () => true,
  maxRadiusNm: 250,
  url: (cfg, radiusNm) =>
    `https://api.airplanes.live/v2/point/${cfg.centerLat}/${cfg.centerLon}/${radiusNm}`,
  parse: (json) => {
    const body = json as { ac?: RawAircraft[]; aircraft?: RawAircraft[] };
    return body.ac ?? body.aircraft ?? [];
  },
};

/**
 * AirLabs - the fallback, and as of August 2026 the only free service still
 * sending `access-control-allow-origin: *`.
 *
 * Needs a free key, which the visitor supplies. Its units differ from the
 * ADS-B convention the rest of the app uses: metres and km/h rather than feet
 * and knots, so both are converted here rather than leaking outward.
 */
export const airlabs: Provider = {
  id: "airlabs",
  label: "AirLabs",
  ready: (cfg) => Boolean(cfg.apiKey?.trim()),
  // AirLabs takes a radius in kilometres; 250 nm keeps the two providers
  // interchangeable and sits inside what it will answer.
  maxRadiusNm: 250,
  url: (cfg, radiusNm) => {
    const km = Math.round(radiusNm * KMH_PER_KNOT);
    const key = encodeURIComponent(cfg.apiKey?.trim() ?? "");
    return (
      `https://airlabs.co/api/v9/flights?lat=${cfg.centerLat}` +
      `&lng=${cfg.centerLon}&distance=${km}&api_key=${key}`
    );
  },
  parse: (json) => {
    const body = json as {
      response?: AirLabsFlight[];
      error?: { message?: string };
    };
    if (body.error) throw new Error(body.error.message ?? "AirLabs error");
    const list = body.response ?? [];

    return list.map((f) => ({
      hex: f.hex,
      flight: f.flight_icao ?? f.flight_iata ?? f.flight_number,
      lat: f.lat,
      lon: f.lng,
      // AirLabs reports altitude in metres; the app works in feet.
      alt_baro:
        typeof f.alt === "number" ? Math.round(f.alt / M_PER_FOOT) : undefined,
      // ...and ground speed in km/h, where the app works in knots.
      gs: typeof f.speed === "number" ? f.speed / KMH_PER_KNOT : undefined,
      track: f.dir,
      baro_rate:
        typeof f.v_speed === "number"
          ? Math.round((f.v_speed / M_PER_FOOT) * 60)
          : undefined,
      r: f.reg_number,
      t: f.aircraft_icao,
      seen: f.updated ? Math.max(0, Date.now() / 1000 - f.updated) : undefined,
    }));
  },
};

/** The subset of AirLabs' flight record this app consumes. */
interface AirLabsFlight {
  hex?: string;
  reg_number?: string;
  lat?: number;
  lng?: number;
  /** Altitude in metres. */
  alt?: number;
  dir?: number;
  /** Ground speed in km/h. */
  speed?: number;
  /** Vertical speed in metres per second. */
  v_speed?: number;
  flight_number?: string;
  flight_icao?: string;
  flight_iata?: string;
  aircraft_icao?: string;
  /** Unix seconds. */
  updated?: number;
}

export const PROVIDERS: Provider[] = [airlabs, airplanesLive];

/**
 * Pick the provider to poll.
 *
 * A supplied key means the visitor has chosen AirLabs deliberately, so it wins.
 * Without one there is only airplanes.live, which will fail while its block
 * stands - but failing against the original feed reports something truer than
 * failing against a service the visitor never configured.
 */
export function selectProvider(cfg: Config): Provider {
  return PROVIDERS.find((p) => p.ready(cfg)) ?? airplanesLive;
}
