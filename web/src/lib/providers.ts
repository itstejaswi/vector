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
//   AirLabs          sends the header, and issues keys from a waiting list
//
// A browser cannot work around any of that: CORS is enforced by the browser
// and only the API's owner can relax it. So the feed is pluggable, and there
// are two working routes: an AirLabs key, or a shim the visitor hosts
// themselves (see `worker/index.js`).
//
// Nothing is bundled - no key, no endpoint. This repository is public and
// permissively licensed, so anything shipped here would become everyone's, and
// land whichever service it points at with traffic from every fork at once.

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
/** Also the km-per-km/h factor, since a knot is one nautical mile per hour. */
const KM_PER_NM = 1.852;

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
 * AirLabs - answers browsers directly, no shim required.
 *
 * Needs a free key, which the visitor supplies; registration runs from a
 * waiting list. Its units differ from the ADS-B convention the rest of the app
 * uses - metres and km/h rather than feet and knots - so both are converted
 * here rather than leaking outward.
 */
export const airlabs: Provider = {
  id: "airlabs",
  label: "AirLabs",
  ready: (cfg) => Boolean(cfg.apiKey?.trim()),
  maxRadiusNm: 250,
  url: (cfg, radiusNm) => {
    const km = Math.round(radiusNm * KM_PER_NM);
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

    return (body.response ?? []).map((f) => ({
      hex: f.hex,
      flight: f.flight_icao ?? f.flight_iata ?? f.flight_number,
      lat: f.lat,
      lon: f.lng,
      // AirLabs reports altitude in metres; the app works in feet.
      alt_baro:
        typeof f.alt === "number" ? Math.round(f.alt / M_PER_FOOT) : undefined,
      // ...and ground speed in km/h, where the app works in knots.
      gs: typeof f.speed === "number" ? f.speed / KM_PER_NM : undefined,
      track: f.dir,
      // Vertical speed arrives in m/s and is shown as feet per minute.
      baro_rate:
        typeof f.v_speed === "number"
          ? Math.round((f.v_speed / M_PER_FOOT) * 60)
          : undefined,
      r: f.reg_number,
      t: f.aircraft_icao,
      seen: f.updated
        ? Math.max(0, Date.now() / 1000 - f.updated)
        : undefined,
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

/**
 * A CORS shim you host yourself.
 *
 * adsb.lol and adsb.fi still serve the data Vector was built around; they just
 * do not send `access-control-allow-origin`, so a browser discards it. A tiny
 * Cloudflare Worker in between adds the header and nothing else - see
 * `worker/index.js` in this repository, roughly 100 lines and free to run.
 *
 * The URL is supplied by the visitor, because it is their Worker: nothing is
 * bundled, nothing is shared, and no quota of ours is spent by a fork.
 */
export const proxy: Provider = {
  id: "proxy",
  label: "adsb.lol",
  ready: (cfg) => Boolean(cfg.feedProxy?.trim()),
  maxRadiusNm: 250,
  url: (cfg, radiusNm) => {
    const base = (cfg.feedProxy ?? "").trim().replace(/\/+$/, "");
    return (
      `${base}?lat=${cfg.centerLat}&lon=${cfg.centerLon}` +
      `&radius=${radiusNm}&source=adsb.lol`
    );
  },
  parse: (json) => {
    const body = json as {
      ac?: RawAircraft[];
      aircraft?: RawAircraft[];
      error?: string;
    };
    if (body.error) throw new Error(body.error);
    // adsb.lol answers in the same shape as airplanes.live, so nothing
    // downstream has to know which one it is reading.
    return body.ac ?? body.aircraft ?? [];
  },
};

export const PROVIDERS: Provider[] = [airlabs, proxy, airplanesLive];

/**
 * Pick the provider to poll.
 *
 * A key or a proxy URL means the visitor set one up deliberately, so those win
 * in that order. Without either there is only airplanes.live, which will fail
 * while its block stands - but failing against the original feed reports
 * something truer than failing against a service the visitor never configured.
 */
export function selectProvider(cfg: Config): Provider {
  return PROVIDERS.find((p) => p.ready(cfg)) ?? airplanesLive;
}
