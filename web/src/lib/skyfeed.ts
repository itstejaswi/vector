// Browser-side flight feed. Replaces the old Node server entirely: polls
// airplanes.live directly, enriches from adsbdb, and keeps config in
// localStorage. Every upstream sends `access-control-allow-origin: *`, so the
// browser can talk to them without a proxy.
//
// The public surface is deliberately identical to the old WebSocket
// `Connection` class, so `useStream` and every consumer work unchanged.

import type { Aircraft, Config, FeedStatus } from "@shared/index.js";
import {
  DEFAULT_CONFIG,
  MAX_RADIUS_MILES,
  greatCircleKm,
  mergeConfig,
} from "@shared/index.js";

const AIRCRAFT_API = "https://api.airplanes.live/v2/point";
const ADSBDB_API = "https://api.adsbdb.com/v0";

const CONFIG_KEY = "vector.config";
/*
 * Versioned because entries outlive a deploy. The cache holds enrichment for
 * ROUTE_TTL_MS, so changing how a value is formatted would leave stale ones on
 * screen until they expired; bumping the suffix retires the old store outright.
 *
 * Do that sparingly. It forces every visitor to refetch at once, and both
 * upstreams are free services.
 */
const ROUTE_CACHE_KEY = "vector.routes.v2";
/** Superseded stores, cleared on load so they don't sit in localStorage. */
const STALE_CACHE_KEYS = ["vector.routes", "skylight.routes"];
/**
 * Config saved under the app's former name. Migrated once so anyone who used
 * it then keeps their location and radius rather than being reset.
 */
const LEGACY_KEYS: Record<string, string> = {
  "skylight.config": CONFIG_KEY,
};

const POLL_MS = 3000;
const NM_PER_MILE = 0.868976;
/** airplanes.live caps the point query at 250 nm. */
const MAX_RADIUS_NM = 250;
/**
 * How long enrichment stays cached.
 *
 * Seven days rather than twelve hours. An airframe's type and registration are
 * effectively permanent, and a flight number's city pair changes with the
 * season at most - so a short expiry buys nothing and costs a fresh round of
 * lookups every half day. Both upstreams are free services; the cache is the
 * main thing keeping the load off them.
 */
const ROUTE_TTL_MS = 7 * 24 * 3600_000;
/** Cap the persisted enrichment cache so localStorage can't grow unbounded. */
const MAX_CACHED_ROUTES = 900;
/** Forget aircraft we haven't seen for this long. */
const STICKY_TTL_MS = 600_000;
/** Trail length cap, in kilometres of ground track. */
const MAX_TRAIL_KM = 50;
/** Hard cap on stored fixes, so a fast jet can't grow the array unbounded. */
const MAX_TRAIL_POINTS = 120;
/** Ignore absurd jumps (bad fix / hex reuse) rather than drawing a streak. */
const MAX_TRAIL_JUMP_DEG = 2.5;
/** Concurrent adsbdb lookups. Busy airspace would otherwise fire hundreds. */
/**
 * Cap on concurrent enrichment lookups.
 *
 * This limits parallelism but not rate: six requests can still leave in the
 * same instant, and the next six the moment they land. ENRICH_MIN_GAP_MS is
 * what actually paces them.
 */
const MAX_INFLIGHT = 4;

/**
 * Minimum spacing between enrichment requests, in milliseconds.
 *
 * adsbdb is a free service run by one person and publishes no quota, so the
 * courteous thing is to stay well under anything that could look like abuse.
 * Measured from a cold cache without this, a single tab pushed 1.93 requests
 * a second; at 250 ms it settles to four, and because every result is cached
 * for 12 hours - misses included - the rate falls to near zero within a
 * minute of opening the page.
 *
 * The map feed is separately paced by POLL_MS: airplanes.live documents a
 * limit of one request per second, and a 3 s poll sits at a third of that.
 */
const ENRICH_MIN_GAP_MS = 250;

/** Cap on lookups held waiting. Excess is dropped and re-offered by a poll. */
const MAX_ENRICH_QUEUE = 200;

export interface StreamState {
  connected: boolean;
  config: Config | null;
  now: number;
  aircraft: Aircraft[];
  status: FeedStatus | null;
  /** Recent ground track per aircraft, oldest first: [lon, lat] pairs. */
  trails: Map<string, [number, number][]>;
}

type Listener = (state: StreamState) => void;

/**
 * Turn a fetch failure into something a visitor can act on.
 *
 * A browser reports a CORS rejection as a bare "Failed to fetch" with no
 * detail, because the response is withheld from the page entirely. That is
 * indistinguishable from being offline unless we say otherwise, and the
 * distinction matters: one is the visitor's connection, the other is the feed
 * provider declining browser traffic and nothing the visitor can fix.
 */
function describeFeedError(err: unknown): string {
  if (!navigator.onLine) return "offline";

  const message = err instanceof Error ? err.message : "";

  if (err instanceof DOMException && err.name === "TimeoutError") {
    return "feed timed out";
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "feed unreachable - the provider is refusing browser requests";
  }
  if (/^HTTP 4\d\d$/.test(message)) {
    return `feed refused the request (${message})`;
  }
  if (/^HTTP 5\d\d$/.test(message)) {
    return `feed is having trouble (${message})`;
  }
  return message || "feed unavailable";
}

/** Raw aircraft record from airplanes.live (the subset we consume). */
interface RawAircraft {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  category?: string;
  r?: string;
  t?: string;
  seen?: number;
}

interface RouteInfo {
  airline?: string;
  origin?: string;
  destination?: string;
  originName?: string;
  destName?: string;
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
}

interface TypeInfo {
  typeName?: string;
  registration?: string;
}

interface CacheEntry<T> {
  /** null = looked up and genuinely not found (negative cache). */
  data: T | null;
  at: number;
}

interface RouteCache {
  routes: Record<string, CacheEntry<RouteInfo>>;
  types: Record<string, CacheEntry<TypeInfo>>;
}

/** Enrichment held across polls so labels never flicker back to blank. */
interface Sticky extends RouteInfo, TypeInfo {
  lastSeen: number;
}

/**
 * Clean a raw callsign. Upstream decoders pad or fill unreadable characters
 * with '@' and '_', which otherwise show up on the map as "@@@@@@@@".
 * Returns undefined when nothing usable is left.
 *
 * Exported for tests.
 */
export function cleanCallsign(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[@_]/g, "").trim().toUpperCase();
  return cleaned.length >= 2 ? cleaned : undefined;
}

/**
 * Tidy adsbdb's aircraft type into the form the industry actually writes.
 *
 * adsbdb returns the model and variant space-separated with fitment codes
 * appended: "A320 251NSL", "737 36N/W", "787 8". Written properly those are
 * "A320-251N", "737-36N" and "787-8" — the hyphen is the convention, and the
 * SL / /W suffixes just mean sharklets and winglets, which no one reads.
 *
 * Deliberately conservative. Only a bare model-plus-variant pair is joined;
 * anything carrying a name ("PA-28 161 Cadet", "182P Skylane") is left exactly
 * as it came, because those aren't variant codes and hyphenating them would
 * be wrong.
 *
 * Exported for tests.
 */
export function cleanTypeName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;

  const parts = trimmed.split(" ");
  if (parts.length !== 2) return trimmed;

  const [model, rawVariant] = parts;
  // Strip fitment suffixes: "/W" winglets, trailing "SL" sharklets.
  const variant = rawVariant.replace(/\/W$/i, "").replace(/SL$/, "");
  if (!variant) return model;

  // A single trailing letter is a sub-model and closes up: "208 B" -> "208B".
  if (/^[A-Z]$/i.test(variant)) return `${model}${variant}`;

  // A variant proper starts with a digit and takes a hyphen.
  if (/^\d/.test(variant)) return `${model}-${variant}`;

  // Anything else is a name, not a variant.
  return trimmed;
}

/**
 * Whether a route is plausible for where the aircraft actually is.
 *
 * Short callsigns collide. adsbdb matched a Qatar Airways 787 over the Arabian
 * Sea to "QTR5B" and returned JFK to Houston: a 2,278 km route whose nearest
 * end was 13,238 km away. The arc was drawn faithfully, and looked absurd.
 *
 * An aircraft in flight is somewhere between its endpoints, so it can never be
 * much further from the nearer one than the route is long. The allowance is
 * deliberately generous - a diversion or a long hold must not be discarded -
 * so this only catches routes belonging to a different flight entirely.
 *
 * Anything missing a coordinate passes: an unverifiable route is not a wrong
 * one, and the map simply won't draw an arc without endpoints.
 *
 * Exported for tests.
 */
export function routeFits(
  lat: number | undefined,
  lon: number | undefined,
  r: {
    originLat?: number;
    originLon?: number;
    destLat?: number;
    destLon?: number;
  },
): boolean {
  if (lat == null || lon == null) return true;
  if (r.originLat == null || r.originLon == null) return true;
  if (r.destLat == null || r.destLon == null) return true;

  const legKm = greatCircleKm(r.originLat, r.originLon, r.destLat, r.destLon);
  const toOrigin = greatCircleKm(lat, lon, r.originLat, r.originLon);
  const toDest = greatCircleKm(lat, lon, r.destLat, r.destLon);

  // Half the leg plus 500 km covers any sane track, hold or diversion.
  return Math.min(toOrigin, toDest) <= legKm * 0.5 + 500;
}

function normalize(raw: RawAircraft, ts: number): Aircraft | null {
  if (!raw.hex) return null;
  const onGround = raw.alt_baro === "ground";
  return {
    hex: raw.hex,
    flight: cleanCallsign(raw.flight),
    lat: raw.lat,
    lon: raw.lon,
    altBaro: onGround ? null : (raw.alt_baro as number | undefined) ?? null,
    altGeom: raw.alt_geom ?? null,
    gs: raw.gs,
    track: raw.track,
    baroRate: raw.baro_rate ?? null,
    category: raw.category,
    onGround,
    registration: raw.r,
    typeCode: raw.t,
    seen: raw.seen,
    ts,
  };
}

/**
 * Airline callsigns are 2-3 letters followed by a flight number. ADS-B also
 * carries military tactical callsigns ("LEADER 4"), bare registrations and
 * junk; sending those to adsbdb just earns a 400 on every poll.
 */
const CALLSIGN_RE = /^[A-Z]{2,3}[0-9][0-9A-Z]{0,3}$/;

/**
 * Drop the oldest fixes until the track is within the distance and point
 * caps. Distance is what the user sees, so that's the primary limit; the
 * point cap is a cheap backstop for very fast aircraft.
 */
function trimTrail(trail: [number, number][]): void {
  if (trail.length > MAX_TRAIL_POINTS) {
    trail.splice(0, trail.length - MAX_TRAIL_POINTS);
  }

  let total = 0;
  // Walk backwards from the newest fix, accumulating length.
  let cut = 0;
  for (let i = trail.length - 1; i > 0; i--) {
    total += greatCircleKm(trail[i][1], trail[i][0], trail[i - 1][1], trail[i - 1][0]);
    if (total > MAX_TRAIL_KM) {
      cut = i - 1;
      break;
    }
  }
  if (cut > 0) trail.splice(0, cut);
}

/**
 * Carry settings over from the pre-rename storage keys, once. Without this a
 * returning user silently loses their location and cached routes.
 */
function migrateLegacyStorage(): void {
  try {
    for (const [oldKey, newKey] of Object.entries(LEGACY_KEYS)) {
      const value = localStorage.getItem(oldKey);
      if (value === null) continue;
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, value);
      }
      localStorage.removeItem(oldKey);
    }
  } catch {
    // storage blocked — nothing to migrate, carry on with defaults
  }
}

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw) as Partial<Config>);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function loadRouteCache(): RouteCache {
  // Retire superseded stores so they don't linger in localStorage. Their
  // contents are cheap to refetch and would otherwise be formatted the old way.
  for (const key of STALE_CACHE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage blocked (private mode) — nothing to clean up
    }
  }
  try {
    const raw = localStorage.getItem(ROUTE_CACHE_KEY);
    if (!raw) return { routes: {}, types: {} };
    const parsed = JSON.parse(raw) as Partial<RouteCache>;
    return { routes: parsed.routes ?? {}, types: parsed.types ?? {} };
  } catch {
    return { routes: {}, types: {} };
  }
}

/**
 * Live sky feed. Same shape as the old WebSocket connection so nothing
 * downstream had to change when the server went away.
 */
export class SkyFeed {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private inflight = new Set<string>();
  private sticky = new Map<string, Sticky>();
  private cache: RouteCache = { routes: {}, types: {} };
  private cacheDirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  /** Guards against overlapping polls when the network is slow. */
  private polling = false;
  /** hex -> recent [lon, lat] fixes, oldest first. */
  private trails = new Map<string, [number, number][]>();
  /** Aircraft whose enrichment jumps the request queue, if any. */
  private priorityHex: string | null = null;
  /** When the last enrichment request went out, for ENRICH_MIN_GAP_MS. */
  private lastEnrichAt = 0;
  /** Lookups waiting their turn, keyed so the same one is never queued twice. */
  private enrichQueue = new Map<string, () => void>();
  /** Drains enrichQueue at ENRICH_MIN_GAP_MS; null while the queue is empty. */
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  state: StreamState = {
    connected: false,
    config: null,
    now: 0,
    aircraft: [],
    status: null,
    trails: new Map(),
  };

  connect(): void {
    this.closed = false;
    migrateLegacyStorage();
    this.cache = loadRouteCache();
    this.update({ config: loadConfig() });

    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
    this.flushTimer = setInterval(() => this.flushCache(), 15_000);
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.drainTimer) clearInterval(this.drainTimer);
    this.timer = null;
    this.flushTimer = null;
    this.drainTimer = null;
    this.enrichQueue.clear();
    this.flushCache();
  }

  // --- config (persisted locally) ---

  /**
   * Mark one aircraft as the user's focus, so its route lookup bypasses the
   * concurrency cap. Set after a flight search; harmless to clear.
   */
  setPriority(hex: string | null): void {
    this.priorityHex = hex;
  }

  patchConfig(patch: Partial<Config>): void {
    const base = this.state.config ?? DEFAULT_CONFIG;
    const next = mergeConfig(base, patch);
    this.update({ config: next });
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    } catch {
      // storage full or blocked (private mode) — run from memory instead
    }
    // Re-centring or re-scoping changes the query window: refresh immediately
    // rather than showing the old area until the next tick.
    if (
      patch.centerLat !== undefined ||
      patch.centerLon !== undefined ||
      patch.radiusMiles !== undefined
    ) {
      // Old tracks belong to the old view; keep them and they'd smear across
      // the map as unrelated streaks.
      if (patch.centerLat !== undefined || patch.centerLon !== undefined) {
        this.trails.clear();
        this.update({ trails: new Map() });
      }
      void this.poll();
    }
  }

  resetConfig(): void {
    this.update({ config: { ...DEFAULT_CONFIG } });
    try {
      localStorage.removeItem(CONFIG_KEY);
    } catch {
      // ignore
    }
    void this.poll();
  }

  // --- polling ---

  private apiUrl(cfg: Config): string {
    // Two limits apply: our own 200 km guard rail, and airplanes.live's
    // hard 250 nm ceiling. Honour whichever bites first.
    const miles = Math.min(cfg.radiusMiles, MAX_RADIUS_MILES);
    const r = Math.min(MAX_RADIUS_NM, Math.ceil(miles * NM_PER_MILE) + 1);
    return `${AIRCRAFT_API}/${cfg.centerLat}/${cfg.centerLon}/${r}`;
  }

  private async poll(): Promise<void> {
    if (this.closed || this.polling) return;
    const cfg = this.state.config;
    if (!cfg) return;

    this.polling = true;
    const now = Date.now();
    try {
      const res = await fetch(this.apiUrl(cfg), {
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as { ac?: RawAircraft[]; aircraft?: RawAircraft[] };
      const rawList = json.ac ?? json.aircraft ?? [];

      const list: Aircraft[] = [];
      for (const raw of rawList) {
        const ac = normalize(raw, now);
        if (ac) {
          this.enrich(ac, now);
          this.recordTrail(ac);
          list.push(ac);
        }
      }

      this.pruneSticky(now);
      this.pruneTrails(list);
      this.update({
        connected: true,
        now,
        aircraft: list,
        // New Map identity so React sees the change.
        trails: new Map(this.trails),
        status: {
          ok: true,
          count: list.length,
          lastOk: now,
          message: "airplanes.live",
        },
      });
    } catch (err) {
      // Keep the last good snapshot on screen; the renderer ages it out.
      this.update({
        connected: false,
        status: {
          ok: false,
          count: this.state.aircraft.length,
          lastOk: this.state.status?.lastOk ?? null,
          message: describeFeedError(err),
        },
      });
    } finally {
      this.polling = false;
    }
  }

  // --- enrichment ---

  private fresh<T>(e: CacheEntry<T> | undefined, now: number): boolean {
    return !!e && now - e.at < ROUTE_TTL_MS;
  }

  /**
   * Whether a route is plausible for where the aircraft actually is.
   *
   * Delegates to the exported routeFits so the rule can be tested directly.
   */
  private routeFits(ac: Aircraft, r: RouteInfo): boolean {
    return routeFits(ac.lat, ac.lon, r);
  }

  private enrich(ac: Aircraft, now: number): void {
    const cs = ac.flight?.trim().toUpperCase();
    const priority = ac.hex === this.priorityHex;
    let routeRejected = false;

    if (cs && CALLSIGN_RE.test(cs)) {
      const hit = this.cache.routes[cs];
      if (this.fresh(hit, now)) {
        const r = hit!.data;
        if (r && this.routeFits(ac, r)) {
          ac.airline = r.airline ?? ac.airline;
          ac.origin = r.origin ?? ac.origin;
          ac.destination = r.destination ?? ac.destination;
          ac.originName = r.originName ?? ac.originName;
          ac.destName = r.destName ?? ac.destName;
          ac.originLat = r.originLat ?? ac.originLat;
          ac.originLon = r.originLon ?? ac.originLon;
          ac.destLat = r.destLat ?? ac.destLat;
          ac.destLon = r.destLon ?? ac.destLon;
        } else if (r) {
          routeRejected = true;
          // The airline is still right even when the city pair is not: the
          // callsign prefix identifies the operator regardless.
          ac.airline = r.airline ?? ac.airline;
        }
      } else {
        void this.fetchRoute(cs, priority);
      }
    }

    const typeHit = this.cache.types[ac.hex];
    if (this.fresh(typeHit, now)) {
      const t = typeHit!.data;
      if (t) {
        ac.typeName = ac.typeName ?? t.typeName;
        ac.registration = ac.registration ?? t.registration;
      }
    } else {
      void this.fetchType(ac.hex);
    }

    // Sticky merge: once resolved, never fall back to blank on a later poll.
    // The route half is skipped when routeFits rejected it, or the value the
    // check just discarded would come straight back from the previous poll.
    const prev = this.sticky.get(ac.hex);
    if (prev) {
      ac.typeName = ac.typeName ?? prev.typeName;
      ac.airline = ac.airline ?? prev.airline;
      ac.registration = ac.registration ?? prev.registration;
      if (!routeRejected) {
        ac.origin = ac.origin ?? prev.origin;
        ac.destination = ac.destination ?? prev.destination;
        ac.originName = ac.originName ?? prev.originName;
        ac.destName = ac.destName ?? prev.destName;
        ac.originLat = ac.originLat ?? prev.originLat;
        ac.originLon = ac.originLon ?? prev.originLon;
        ac.destLat = ac.destLat ?? prev.destLat;
        ac.destLon = ac.destLon ?? prev.destLon;
      }
    }

    this.sticky.set(ac.hex, {
      typeName: ac.typeName,
      airline: ac.airline,
      origin: ac.origin,
      destination: ac.destination,
      registration: ac.registration,
      originName: ac.originName,
      destName: ac.destName,
      originLat: ac.originLat,
      originLon: ac.originLon,
      destLat: ac.destLat,
      destLon: ac.destLon,
      lastSeen: now,
    });
  }

  /**
   * Whether an enrichment request may go out now.
   *
   * `bypass` covers the two cases that have already earned a slot: a flight
   * the user searched for, and a lookup released by the drain timer, which is
   * itself the pacing.
   *
   * A hard gate without the queue would throttle to one lookup per poll, since
   * every candidate is considered in the same tick and only the first would
   * pass. Turned-away work is queued and drained on a timer instead, so the
   * rate is steady rather than accidental.
   */
  private canEnrich(bypass: boolean): boolean {
    if (bypass) return true;
    if (this.inflight.size >= MAX_INFLIGHT) return false;
    return Date.now() - this.lastEnrichAt >= ENRICH_MIN_GAP_MS;
  }

  /**
   * Hold a lookup for later rather than dropping it.
   *
   * Deduplicated by key, and capped: if the queue is somehow long, the excess
   * is simply forgotten and re-offered by a later poll. That keeps a backlog
   * from building into a burst.
   */
  private queueEnrich(key: string, run: () => void): void {
    if (this.inflight.has(key) || this.enrichQueue.has(key)) return;
    if (this.enrichQueue.size >= MAX_ENRICH_QUEUE) return;
    this.enrichQueue.set(key, run);
    this.startDrain();
  }

  /** Release one queued lookup every ENRICH_MIN_GAP_MS until the queue empties. */
  private startDrain(): void {
    if (this.drainTimer !== null) return;
    this.drainTimer = setInterval(() => {
      if (this.closed || this.enrichQueue.size === 0) {
        if (this.drainTimer !== null) clearInterval(this.drainTimer);
        this.drainTimer = null;
        return;
      }
      if (this.inflight.size >= MAX_INFLIGHT) return;
      const [key, run] = this.enrichQueue.entries().next().value!;
      this.enrichQueue.delete(key);
      run();
    }, ENRICH_MIN_GAP_MS);
  }

  private async fetchRoute(cs: string, priority = false): Promise<void> {
    const key = "r:" + cs;
    if (this.inflight.has(key)) return;
    // A flight the user explicitly searched for jumps the queue. Without this
    // it competes with every other aircraft on screen for the handful of
    // concurrent slots, and can sit on "NO ROUTE FILED" for several polls
    // while a hundred others are enriched ahead of it.
    if (!this.canEnrich(priority)) {
      this.queueEnrich(key, () => void this.fetchRoute(cs, true));
      return;
    }
    this.lastEnrichAt = Date.now();
    this.inflight.add(key);
    try {
      const res = await fetch(`${ADSBDB_API}/callsign/${encodeURIComponent(cs)}`, {
        signal: AbortSignal.timeout(8000),
      });
      let data: RouteInfo | null = null;
      if (res.ok) {
        const json = (await res.json()) as any;
        const fr = json?.response?.flightroute;
        if (fr) {
          data = {
            airline: fr.airline?.name,
            origin: fr.origin?.iata_code ?? fr.origin?.icao_code,
            destination: fr.destination?.iata_code ?? fr.destination?.icao_code,
            originName: fr.origin?.municipality,
            destName: fr.destination?.municipality,
            originLat: fr.origin?.latitude,
            originLon: fr.origin?.longitude,
            destLat: fr.destination?.latitude,
            destLon: fr.destination?.longitude,
          };
        }
      } else if (res.status !== 404 && res.status !== 400) {
        // Server-side trouble: don't burn a cache slot, just retry later.
        return;
      }
      // 404 = no route on file; 400 = adsbdb rejects the callsign shape. Both
      // are permanent for this key, so cache the miss instead of re-asking
      // on every poll.
      this.cache.routes[cs] = { data, at: Date.now() };
      this.cacheDirty = true;
    } catch {
      // leave uncached so a later poll retries
    } finally {
      this.inflight.delete(key);
    }
  }

  private async fetchType(hex: string, released = false): Promise<void> {
    const key = "t:" + hex;
    if (this.inflight.has(key)) return;
    if (!this.canEnrich(released)) {
      this.queueEnrich(key, () => void this.fetchType(hex, true));
      return;
    }
    this.lastEnrichAt = Date.now();
    this.inflight.add(key);
    try {
      const res = await fetch(`${ADSBDB_API}/aircraft/${encodeURIComponent(hex)}`, {
        signal: AbortSignal.timeout(8000),
      });
      let data: TypeInfo | null = null;
      if (res.ok) {
        const json = (await res.json()) as any;
        const a = json?.response?.aircraft;
        if (a) {
          const type = cleanTypeName(a.type);
          data = {
            typeName: a.manufacturer && type ? `${a.manufacturer} ${type}` : type,
            registration: a.registration,
          };
        }
      } else if (res.status !== 404 && res.status !== 400) {
        return;
      }
      // Negative-cache unknown airframes for the same reason as routes.
      this.cache.types[hex] = { data, at: Date.now() };
      this.cacheDirty = true;
    } catch {
      // retry later
    } finally {
      this.inflight.delete(key);
    }
  }

  private pruneSticky(now: number): void {
    for (const [hex, s] of this.sticky) {
      if (now - s.lastSeen > STICKY_TTL_MS) this.sticky.delete(hex);
    }
  }

  /** Append this fix to the aircraft's ground track. */
  private recordTrail(ac: Aircraft): void {
    if (ac.lat == null || ac.lon == null) return;
    const trail = this.trails.get(ac.hex);
    if (!trail) {
      this.trails.set(ac.hex, [[ac.lon, ac.lat]]);
      return;
    }

    const last = trail[trail.length - 1];
    // Skip a duplicate fix; drop the history entirely on an implausible jump.
    if (last[0] === ac.lon && last[1] === ac.lat) return;
    if (
      Math.abs(last[0] - ac.lon) > MAX_TRAIL_JUMP_DEG ||
      Math.abs(last[1] - ac.lat) > MAX_TRAIL_JUMP_DEG
    ) {
      this.trails.set(ac.hex, [[ac.lon, ac.lat]]);
      return;
    }

    trail.push([ac.lon, ac.lat]);
    trimTrail(trail);
  }

  /** Drop trails for aircraft no longer in the feed. */
  private pruneTrails(current: Aircraft[]): void {
    const live = new Set(current.map((a) => a.hex));
    for (const hex of this.trails.keys()) {
      if (!live.has(hex)) this.trails.delete(hex);
    }
  }

  /** Keep only the newest N entries so the cache can't outgrow localStorage. */
  private trimCache(): void {
    for (const bucket of [this.cache.routes, this.cache.types]) {
      const keys = Object.keys(bucket);
      if (keys.length <= MAX_CACHED_ROUTES) continue;
      keys
        .sort((a, b) => bucket[b].at - bucket[a].at)
        .slice(MAX_CACHED_ROUTES)
        .forEach((k) => delete bucket[k]);
    }
  }

  private flushCache(): void {
    if (!this.cacheDirty) return;
    this.cacheDirty = false;
    this.trimCache();
    try {
      localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(this.cache));
    } catch {
      // Quota exceeded: drop the cache and carry on from memory.
      try {
        localStorage.removeItem(ROUTE_CACHE_KEY);
      } catch {
        // ignore
      }
    }
  }

  // --- subscription ---

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private update(partial: Partial<StreamState>): void {
    this.state = { ...this.state, ...partial };
    for (const fn of this.listeners) fn(this.state);
  }
}
