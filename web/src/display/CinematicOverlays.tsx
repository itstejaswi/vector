import { useEffect, useMemo, useState } from "react";
import type { Aircraft } from "@shared/index.js";
import { distSq, greatCircleKm, milesToKm } from "@shared/index.js";

interface Props {
  locationName: string;
  centerLat: number;
  centerLon: number;
  radiusMiles: number;
  aircraft: Aircraft[];
  connected: boolean;
  source: string;
  now: number;
  selectedHex: string | null;
  onDeselect: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSelect: (hex: string) => void;
}

/**
 * The HUD layer: a route card for the focused flight, a live contact list,
 * and ambient telemetry. Everything is pointer-transparent except the
 * controls, so clicks fall through to the map underneath.
 */
export function CinematicOverlays({
  locationName,
  centerLat,
  centerLon,
  radiusMiles,
  aircraft,
  connected,
  source,
  now,
  selectedHex,
  onDeselect,
  onZoomIn,
  onZoomOut,
  onSelect,
}: Props) {
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const selected = useMemo(
    () => (selectedHex ? aircraft.find((a) => a.hex === selectedHex) ?? null : null),
    [selectedHex, aircraft],
  );

  const nearestRouted = useMemo(
    () => pickNearest(aircraft, centerLat, centerLon, hasRoute),
    [aircraft, centerLat, centerLon],
  );

  const nearest = useMemo(
    () => pickNearest(aircraft, centerLat, centerLon, () => true),
    [aircraft, centerLat, centerLon],
  );

  // The card follows your selection; with nothing selected it profiles the
  // closest flight that actually has route data to show.
  const focus = selected ?? nearestRouted ?? nearest;
  const isAuto = !selected && focus != null;

  const contacts = useMemo(
    () => rankContacts(aircraft, centerLat, centerLon).slice(0, 7),
    [aircraft, centerLat, centerLon],
  );

  const stats = useMemo(() => computeTraffic(aircraft), [aircraft]);
  const fixAge = now > 0 ? Math.max(0, Math.round((Date.now() - now) / 1000)) : null;

  return (
    <div className="hud">
      <div className="hud-vignette" />
      <div className="hud-scanlines" />
      <span className="hud-bk hud-bk-tl" aria-hidden="true" />
      <span className="hud-bk hud-bk-tr" aria-hidden="true" />
      <span className="hud-bk hud-bk-bl" aria-hidden="true" />
      <span className="hud-bk hud-bk-br" aria-hidden="true" />

      {/* ---------- top status strip ---------- */}
      <div className="hud-strip">
        <span className="hud-wordmark">VECTOR</span>
        <span className="hud-strip-sep" />
        <span className={"hud-dot " + (connected ? "ok" : "bad")} />
        <span className="hud-strip-name">{locationName || "UNKNOWN"}</span>
        <span className="hud-strip-sep" />
        <span>{stats.total} CONTACTS</span>
        <span className="hud-strip-sep" />
        <span>{Math.round(milesToKm(radiusMiles))} KM</span>
        <span className="hud-strip-sep" />
        <span className="hud-strip-clock">{clockString(clock)} UTC</span>
      </div>

      {/* ---------- zoom controls ---------- */}
      <div className="hud-zoom">
        <button type="button" onClick={onZoomIn} title="Zoom in">
          +
        </button>
        <button type="button" onClick={onZoomOut} title="Zoom out">
          −
        </button>
      </div>

      {/* ---------- flight card ---------- */}
      {focus && (
        <section className="panel panel-flight">
          <header className="panel-head">
            <span className="panel-glyph">✈</span>
            <span>FLIGHT INFO</span>
            {isAuto ? (
              <span className="panel-tag">NEAREST</span>
            ) : (
              <button
                type="button"
                className="panel-x"
                onClick={onDeselect}
                title="Clear selection"
              >
                ✕
              </button>
            )}
          </header>

          <div className="fx-call">
            <span className="fx-call-id">{(focus.flight || focus.hex).toUpperCase()}</span>
            {focus.airline && <span className="fx-call-airline">{focus.airline}</span>}
          </div>

          {focus.origin || focus.destination ? (
            <div className="fx-route">
              <Endpoint kind="DEPARTURE" code={focus.origin} city={focus.originName} />
              <div className="fx-link">
                <span className="fx-link-dot" />
                <span className="fx-link-line" />
                <span className="fx-link-plane">✈</span>
                <span className="fx-link-line" />
                <span className="fx-link-dot" />
              </div>
              <Endpoint kind="ARRIVAL" code={focus.destination} city={focus.destName} />
            </div>
          ) : (
            <div className="fx-noroute">
              <span className="fx-noroute-title">NO ROUTE FILED</span>
              <span className="fx-noroute-sub">
                {focus.registration
                  ? `Reg ${focus.registration}`
                  : "Route data unavailable for this callsign"}
              </span>
            </div>
          )}

          <div className="fx-rows">
            <Metric icon="◎" label="DISTANCE" value={routeDistance(focus)} />
            <Metric icon="◷" label="TIME TO GO" value={timeToGo(focus)} />
            <Metric icon="✈" label="AIRCRAFT" value={aircraftType(focus)} />
            <Metric icon="▲" label="ALTITUDE" value={altitude(focus)} />
            <Metric icon="»" label="SPEED" value={speed(focus)} />
            <Metric icon="◈" label="STATUS" value={status(focus)} highlight />
          </div>
        </section>
      )}

      {/* ---------- left rail ---------- */}
      <div className="hud-rail">
        <section className="panel">
          <header className="panel-head">
            <span className="panel-glyph">▮</span>
            <span>TELEMETRY</span>
          </header>
          <div className="tm-grid">
            <Cell label="AIRBORNE" value={String(stats.airborne)} />
            <Cell label="GROUND" value={String(stats.ground)} />
            <Cell label="CLIMB" value={String(stats.climbing)} />
            <Cell label="DESCEND" value={String(stats.descending)} />
          </div>
          <div className="tm-foot">
            <span>{(source || "AIRPLANES.LIVE").toUpperCase()}</span>
            <span>{fixAge == null ? "—" : `FIX ${Math.min(fixAge, 99)}s`}</span>
          </div>
        </section>

        <section className="panel panel-contacts">
          <header className="panel-head">
            <span className="panel-glyph">◈</span>
            <span>LIVE TRAFFIC</span>
            <span className="panel-tag">{contacts.length}</span>
          </header>

          {contacts.length === 0 ? (
            <div className="ct-empty">
              {connected ? "No aircraft in range" : "Connecting to feed…"}
            </div>
          ) : (
            <div className="ct-list">
              {contacts.map((ac) => (
                <button
                  type="button"
                  key={ac.hex}
                  className={"ct-row" + (ac.hex === selectedHex ? " active" : "")}
                  onClick={() => onSelect(ac.hex)}
                >
                  <span className="ct-call">{(ac.flight || ac.hex).toUpperCase()}</span>
                  <span className="ct-route">
                    {ac.origin && ac.destination
                      ? `${ac.origin} → ${ac.destination}`
                      : ac.typeCode || "—"}
                  </span>
                  <span className="ct-alt">{shortAlt(ac)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---------- credit ---------- */}
      <footer className="hud-credit">
        Vibe coded by Tejaswi
        <span className="hud-credit-dot" aria-hidden="true">
          ·
        </span>
        built with <span className="hud-credit-heart">♥</span> and Microsoft Scout
      </footer>
    </div>
  );
}

/* ---------------- sub-components ---------------- */

function Endpoint({
  kind,
  code,
  city,
}: {
  kind: string;
  code?: string;
  city?: string;
}) {
  return (
    <div className="fx-end">
      <div className="fx-end-kind">{kind}</div>
      <div className="fx-end-code">{code ? code.toUpperCase() : "—"}</div>
      {city && <div className="fx-end-city">{city}</div>}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={"fx-row" + (highlight ? " hot" : "")}>
      <span className="fx-row-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="fx-row-label">{label}</span>
      <span className="fx-row-value">{value}</span>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="tm-cell">
      <span className="tm-cell-value">{value}</span>
      <span className="tm-cell-label">{label}</span>
    </div>
  );
}

/* ---------------- formatting ---------------- */

const pad = (n: number) => n.toString().padStart(2, "0");

function clockString(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function aircraftType(ac: Aircraft): string {
  return ac.typeName || ac.typeCode || "UNKNOWN";
}

function altitude(ac: Aircraft): string {
  if (ac.onGround) return "ON GROUND";
  const a = ac.altBaro ?? ac.altGeom;
  return a == null ? "—" : `${a.toLocaleString("en-US")} ft`;
}

function speed(ac: Aircraft): string {
  if (ac.gs == null) return "—";
  return `${Math.round(ac.gs * 1.852)} km/h`;
}

function shortAlt(ac: Aircraft): string {
  if (ac.onGround) return "GND";
  const a = ac.altBaro ?? ac.altGeom;
  if (a == null) return "—";
  return a >= 1000 ? `${Math.round(a / 1000)}k` : String(a);
}

function status(ac: Aircraft): string {
  if (ac.onGround) return "ON GROUND";
  const r = ac.baroRate;
  if (r != null && r > 250) return "CLIMBING";
  if (r != null && r < -250) return "DESCENDING";
  return "EN ROUTE";
}

function routeDistance(ac: Aircraft): string {
  if (!hasRoute(ac)) return "—";
  const km = greatCircleKm(ac.originLat!, ac.originLon!, ac.destLat!, ac.destLon!);
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

function timeToGo(ac: Aircraft): string {
  if (ac.destLat == null || ac.destLon == null) return "—";
  if (ac.lat == null || ac.lon == null || !ac.gs || ac.gs < 40) return "—";
  const km = greatCircleKm(ac.lat, ac.lon, ac.destLat, ac.destLon);
  const hours = km / (ac.gs * 1.852);
  if (!isFinite(hours) || hours <= 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${pad(m)}m` : `${m} min`;
}

/* ---------------- geometry & selection ---------------- */

function hasRoute(ac: Aircraft): boolean {
  return (
    ac.originLat != null &&
    ac.originLon != null &&
    ac.destLat != null &&
    ac.destLon != null
  );
}

function pickNearest(
  list: Aircraft[],
  lat: number,
  lon: number,
  accept: (ac: Aircraft) => boolean,
): Aircraft | null {
  let best: Aircraft | null = null;
  let bestD = Infinity;
  for (const ac of list) {
    if (ac.lat == null || ac.lon == null || ac.onGround) continue;
    if (!accept(ac)) continue;
    const d = distSq(ac.lat, ac.lon, lat, lon);
    if (d < bestD) {
      bestD = d;
      best = ac;
    }
  }
  return best;
}

/** Airborne contacts, closest first — routed flights float to the top. */
function rankContacts(list: Aircraft[], lat: number, lon: number): Aircraft[] {
  return list
    .filter((ac) => ac.lat != null && ac.lon != null && !ac.onGround)
    .sort((a, b) => {
      const ra = a.origin && a.destination ? 0 : 1;
      const rb = b.origin && b.destination ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return distSq(a.lat!, a.lon!, lat, lon) - distSq(b.lat!, b.lon!, lat, lon);
    });
}

interface TrafficStats {
  total: number;
  airborne: number;
  ground: number;
  climbing: number;
  descending: number;
}

function computeTraffic(list: Aircraft[]): TrafficStats {
  let airborne = 0;
  let ground = 0;
  let climbing = 0;
  let descending = 0;
  for (const ac of list) {
    if (ac.onGround) {
      ground++;
      continue;
    }
    airborne++;
    const r = ac.baroRate;
    if (r != null && r > 250) climbing++;
    else if (r != null && r < -250) descending++;
  }
  return { total: list.length, airborne, ground, climbing, descending };
}
