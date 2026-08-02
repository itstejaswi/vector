import { useEffect, useMemo, useState } from "react";
import type { Aircraft } from "@shared/index.js";

interface Props {
  locationName: string;
  centerLat: number;
  centerLon: number;
  aircraftCount: number;
  radiusMiles: number;
  aircraft: Aircraft[];
  connected: boolean;
  source: string;
  now: number;
  selectedHex: string | null;
  onRecenter: () => void;
  onDeselect: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function CinematicOverlays({
  locationName,
  centerLat,
  centerLon,
  aircraftCount,
  radiusMiles,
  aircraft,
  connected,
  source,
  now,
  selectedHex,
  onRecenter,
  onDeselect,
  onZoomIn,
  onZoomOut,
}: Props) {
  const [tick, setTick] = useState(new Date());
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const utc = formatTime(tick, true);
  const local = formatTime(tick, false);
  const uptime = formatUptime(Date.now() - mountedAt);
  const fixAge = now > 0 ? Math.max(0, Math.floor((Date.now() - now) / 1000)) : -1;
  const fixStr = fixAge < 0 ? "-" : fixAge > 99 ? "99+ s" : fixAge + " s";
  const latStr = formatCoord(centerLat, "NS");
  const lonStr = formatCoord(centerLon, "EW");

  // Find currently displayed aircraft for each panel
  const selected = useMemo(
    () => (selectedHex ? aircraft.find((a) => a.hex === selectedHex) ?? null : null),
    [selectedHex, aircraft],
  );
  const nearest = useMemo(
    () => nearestAircraft(aircraft, centerLat, centerLon),
    [aircraft, centerLat, centerLon],
  );
  const nearestRouted = useMemo(
    () => nearestRoutedAircraft(aircraft, centerLat, centerLon),
    [aircraft, centerLat, centerLon],
  );

  // TRACKING panel: show selected if any, otherwise nearest
  const tracking = selected ?? nearest;

  // ROUTE panel: show selected if routed, otherwise nearest routed plane
  const routed = selected && hasRouteData(selected) ? selected : nearestRouted;

  // Traffic stats
  const stats = useMemo(() => computeTraffic(aircraft), [aircraft]);
  const airspace = useMemo(() => computeAirspace(aircraft), [aircraft]);

  const selectedLabel = selected
    ? (selected.flight || selected.hex.toUpperCase()).trim()
    : null;

  return (
    <div className="cinematic-overlays">
      <div className="cine-grid" />
      <div className="cine-vignette" />

      <div className="cine-corner-bracket cine-tl" />
      <div className="cine-corner-bracket cine-tr" />
      <div className="cine-corner-bracket cine-bl" />
      <div className="cine-corner-bracket cine-br" />

      <div className="cine-radar-sweep" />
      <div className="cine-beacon-wrap">
        <div className="cine-beacon-range" />
        <div className="cine-beacon-core" />
      </div>

      <div className="cine-topbar">
        {selectedLabel && (
          <div className="cine-selected-badge">
            <span>SELECTED: {selectedLabel}</span>
            <button onClick={onDeselect} title="Deselect">X</button>
          </div>
        )}
       <button className="cine-recenter-btn" onClick={onZoomIn} title="Zoom in (smaller radius)">
          + ZOOM IN
        </button>
        <button className="cine-recenter-btn" onClick={onZoomOut} title="Zoom out (larger radius)">
          - ZOOM OUT
        </button>
      </div>

      {/* ============== LEFT RAIL ============== */}
      <div className="cine-rail-l">
        {/* FLIGHT TRACKER */}
        <div className="cine-hud">
          <div className="cine-hud-title">
            <span className={"cine-status-dot " + (connected ? "ok" : "bad")} />
            FLIGHT TRACKER
          </div>
          <Row label="LOC" value={locationName.toUpperCase()} />
          <Row label="LAT" value={latStr} />
          <Row label="LON" value={lonStr} />
          <Row label="RAD" value={radiusMiles.toFixed(1) + " MI"} />
          <Row label="TRK" value={aircraftCount + " CONTACTS"} />
          <Row label="SRC" value={(source || "AIRPLANES.LIVE").toUpperCase()} />
        </div>

        {/* TRAFFIC */}
        <div className="cine-hud cine-orange">
          <div className="cine-hud-title">TRAFFIC</div>
          <Row label="TOTAL" value={stats.total + ""} />
          <Row label="AIRBORNE" value={stats.airborne + ""} />
          <Row label="GROUND" value={stats.ground + ""} />
          <Row label="CLIMB" value={stats.climbing + ""} />
          <Row label="DESCEND" value={stats.descending + ""} />
          <Row label="LEVEL" value={stats.level + ""} />
        </div>

        {/* SCAN */}
        <div className="cine-hud">
          <div className="cine-hud-title">SCAN</div>
          <Row label="MODE" value="ADS-B PASSIVE" />
          <Row label="FREQ" value="1090 MHZ" />
          <Row label="RNG" value={radiusMiles.toFixed(1) + " MI"} />
          <Row label="STATE" value={<span className="cine-blink">ACTIVE</span>} />
        </div>

        {/* ROUTE */}
        <div className="cine-hud cine-orange">
          <div className="cine-hud-title">ROUTE</div>
          {routed ? (
            <RouteRows ac={routed} centerLat={centerLat} centerLon={centerLon} />
          ) : (
            <Row label="STATUS" value="WAITING FOR ROUTE DATA" />
          )}
        </div>
      </div>

      {/* ============== RIGHT RAIL ============== */}
      <div className="cine-rail-r">
        {/* CHRONO */}
        <div className="cine-hud">
          <div className="cine-hud-title">CHRONO</div>
          <Row label="UTC" value={utc} />
          <Row label="LCL" value={local} />
          <Row label="UP" value={uptime} />
          <Row label="FIX" value={fixStr} />
        </div>

        {/* AIRSPACE */}
        <div className="cine-hud cine-orange">
          <div className="cine-hud-title">AIRSPACE</div>
          <Row label="LOW <10K" value={airspace.low + ""} />
          <Row label="MID 10-25K" value={airspace.mid + ""} />
          <Row label="CRUISE 25-40K" value={airspace.cruise + ""} />
          <Row label="HIGH >40K" value={airspace.high + ""} />
          <Row label="AVG ALT" value={airspace.avg != null ? airspace.avg.toLocaleString("en-US") + " FT" : "-"} />
        </div>

        {/* TRACKING */}
        <div className="cine-hud">
          <div className="cine-hud-title">
            {selected ? "TRACKING (SELECTED)" : "TRACKING"}
          </div>
          {tracking ? (
            <>
              <Row label="CALL" value={(tracking.flight || tracking.hex).toUpperCase()} />
              <Row label="TYPE" value={(tracking.typeName || tracking.typeCode || "UNKN").toUpperCase()} />
              <Row label="ALT" value={fmtAlt(tracking)} />
              <Row label="SPD" value={tracking.gs != null ? Math.round(tracking.gs) + " KT" : "-"} />
              <Row label="HDG" value={tracking.track != null ? Math.round(tracking.track) + " DEG" : "-"} />
              <Row label="VS" value={fmtVS(tracking)} />
            </>
          ) : (
            <Row label="STATUS" value="NO CONTACTS" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ============= sub-components ============= */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cine-hud-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function RouteRows({ ac, centerLat, centerLon }: { ac: Aircraft; centerLat: number; centerLon: number }) {
  const distTotal = greatCircleMiles(ac.originLat!, ac.originLon!, ac.destLat!, ac.destLon!);
  const flown = ac.lat != null && ac.lon != null
    ? greatCircleMiles(ac.originLat!, ac.originLon!, ac.lat, ac.lon)
    : 0;
  const toGo = ac.lat != null && ac.lon != null
    ? greatCircleMiles(ac.lat, ac.lon, ac.destLat!, ac.destLon!)
    : distTotal;
  const eta = formatETA(toGo, ac.gs);

  void centerLat; void centerLon;

  return (
    <>
      <Row label="CALL" value={(ac.flight || ac.hex).toUpperCase()} />
      <Row label="FROM" value={(ac.origin || "-").toUpperCase()} />
      <Row label="TO" value={(ac.destination || "-").toUpperCase()} />
      <Row label="DIST" value={Math.round(distTotal).toLocaleString("en-US") + " MI"} />
      <Row label="FLOWN" value={Math.round(flown).toLocaleString("en-US") + " MI"} />
      <Row label="TO-GO" value={Math.round(toGo).toLocaleString("en-US") + " MI"} />
      <Row label="ETA" value={eta} />
    </>
  );
}

/* ============= helpers ============= */

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTime(d: Date, utc: boolean): string {
  const h = utc ? d.getUTCHours() : d.getHours();
  const m = utc ? d.getUTCMinutes() : d.getMinutes();
  const s = utc ? d.getUTCSeconds() : d.getSeconds();
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function formatUptime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function formatCoord(value: number, axis: "NS" | "EW"): string {
  const positive = value >= 0;
  const letter = axis === "NS" ? (positive ? "N" : "S") : positive ? "E" : "W";
  return Math.abs(value).toFixed(4) + " " + letter;
}

function fmtAlt(ac: Aircraft): string {
  const a = ac.altBaro ?? ac.altGeom;
  if (ac.onGround) return "GND";
  if (a == null) return "-";
  return a.toLocaleString("en-US") + " FT";
}

function fmtVS(ac: Aircraft): string {
  if (ac.baroRate == null) return "-";
  const r = Math.round(ac.baroRate);
  if (r === 0) return "0 FPM";
  return (r > 0 ? "+" : "") + r.toLocaleString("en-US") + " FPM";
}

function formatETA(toGoMi: number, gsKt: number | undefined): string {
  if (!gsKt || gsKt <= 30 || !isFinite(toGoMi) || toGoMi <= 0) return "-";
  const hours = toGoMi / gsKt;
  const eta = new Date(Date.now() + hours * 3600 * 1000);
  return pad(eta.getHours()) + ":" + pad(eta.getMinutes());
}

function nearestAircraft(list: Aircraft[], lat: number, lon: number): Aircraft | null {
  let best: Aircraft | null = null;
  let bestD = Infinity;
  for (const ac of list) {
    if (ac.lat == null || ac.lon == null) continue;
    const dy = (ac.lat - lat) * 111;
    const dx = (ac.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180);
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = ac;
    }
  }
  return best;
}

function nearestRoutedAircraft(list: Aircraft[], lat: number, lon: number): Aircraft | null {
  let best: Aircraft | null = null;
  let bestD = Infinity;
  for (const ac of list) {
    if (!hasRouteData(ac)) continue;
    if (ac.lat == null || ac.lon == null) continue;
    const dy = (ac.lat - lat) * 111;
    const dx = (ac.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180);
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = ac;
    }
  }
  return best;
}

function hasRouteData(ac: Aircraft): boolean {
  return !!(
    ac.origin && ac.destination &&
    ac.originLat != null && ac.originLon != null &&
    ac.destLat != null && ac.destLon != null
  );
}

function greatCircleMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const DEG = Math.PI / 180;
  const f1 = lat1 * DEG;
  const f2 = lat2 * DEG;
  const df = (lat2 - lat1) * DEG;
  const dl = (lon2 - lon1) * DEG;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface TrafficStats {
  total: number;
  airborne: number;
  ground: number;
  climbing: number;
  descending: number;
  level: number;
}

function computeTraffic(list: Aircraft[]): TrafficStats {
  let airborne = 0, ground = 0, climbing = 0, descending = 0, level = 0;
  for (const ac of list) {
    if (ac.onGround) {
      ground++;
    } else {
      airborne++;
      const r = ac.baroRate;
      if (r != null && r > 250) climbing++;
      else if (r != null && r < -250) descending++;
      else level++;
    }
  }
  return { total: list.length, airborne, ground, climbing, descending, level };
}

interface AirspaceStats {
  low: number;
  mid: number;
  cruise: number;
  high: number;
  avg: number | null;
}

function computeAirspace(list: Aircraft[]): AirspaceStats {
  let low = 0, mid = 0, cruise = 0, high = 0;
  let sum = 0, n = 0;
  for (const ac of list) {
    if (ac.onGround) continue;
    const a = ac.altBaro ?? ac.altGeom;
    if (a == null) continue;
    if (a < 10000) low++;
    else if (a < 25000) mid++;
    else if (a < 40000) cruise++;
    else high++;
    sum += a;
    n++;
  }
  return { low, mid, cruise, high, avg: n > 0 ? Math.round(sum / n) : null };
}