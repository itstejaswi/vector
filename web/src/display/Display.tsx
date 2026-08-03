import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import type { Config } from "@shared/index.js";
import { DEFAULT_CONFIG, MAX_RADIUS_MILES, MIN_RADIUS_MILES } from "@shared/index.js";
import { useStream } from "../lib/useStream.js";
import type { MotionModel } from "../lib/motion.js";
import { GeoMapLayer } from "./GeoMapLayer.js";
import { AircraftCanvas } from "./AircraftCanvas.js";
import { CinematicOverlays } from "./CinematicOverlays.js";
import { LocationBox } from "./LocationBox.js";
import type { FlightHit } from "../lib/flights.js";

/**
 * Radius ladder in miles, stopping at the 200 km cap. The values are chosen
 * to read as round numbers in kilometres: 10, 25, 50, 100, 150, 200.
 */
const RADIUS_STEPS = [
  MIN_RADIUS_MILES, // ~3.1 mi  =   5 km
  6.2, //  10 km
  15.5, //  25 km
  31.1, //  50 km
  62.1, // 100 km
  93.2, // 150 km
  MAX_RADIUS_MILES, // 124.3 mi = 200 km
];

export function Display() {
  const { state, conn } = useStream();

  const configRef = useRef<Config>(state.config ?? DEFAULT_CONFIG);
  configRef.current = state.config ?? DEFAULT_CONFIG;

  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [centerVersion, setCenterVersion] = useState(0);
  /** Deadline until which a freshly searched selection survives an empty feed. */
  const selectionGraceRef = useRef(0);
  /** Shared render state, handed over once the map is ready. */
  const [render, setRender] = useState<{
    map: maplibregl.Map;
    motion: MotionModel;
    labelled: Set<string>;
  } | null>(null);

  const handleMapReady = useCallback(
    (ctx: { map: maplibregl.Map; motion: MotionModel; labelled: Set<string> }) =>
      setRender(ctx),
    [],
  );

  const selectedAircraft = useMemo(
    () =>
      selectedHex ? state.aircraft.find((a) => a.hex === selectedHex) ?? null : null,
    [selectedHex, state.aircraft],
  );

  const handleSelect = useCallback((hex: string | null) => setSelectedHex(hex), []);
  const handleDeselect = useCallback(() => setSelectedHex(null), []);

  const handlePickLocation = useCallback(
    (centerLat: number, centerLon: number, locationName: string) => {
      setSelectedHex(null);
      setCenterVersion((v) => v + 1);
      conn.patchConfig({ centerLat, centerLon, locationName });
    },
    [conn],
  );

  /**
   * Fly to a flight found anywhere on Earth. The feed only returns aircraft
   * inside the radius, so the map has to move to it first; selecting by hex
   * then takes effect as soon as the next poll brings the aircraft in.
   */
  const handlePickFlight = useCallback(
    (hit: FlightHit) => {
      const name = hit.callsign ?? hit.registration ?? hit.hex.toUpperCase();
      // Two polls' worth of slack for the aircraft to appear in the feed.
      selectionGraceRef.current = Date.now() + 8000;
      conn.setPriority(hit.hex);
      setCenterVersion((v) => v + 1);
      setSelectedHex(hit.hex);
      conn.patchConfig({
        centerLat: hit.lat,
        centerLon: hit.lon,
        locationName: `${name} in flight`,
      });
    },
    [conn],
  );

  const stepRadius = useCallback(
    (dir: -1 | 1) => {
      const current = configRef.current.radiusMiles;
      // Find where we sit on the ladder, then move one rung.
      let idx = RADIUS_STEPS.findIndex((r) => r >= current - 0.01);
      if (idx === -1) idx = RADIUS_STEPS.length - 1;
      const next = RADIUS_STEPS[clamp(idx + dir, 0, RADIUS_STEPS.length - 1)];
      if (Math.abs(next - current) > 0.01) conn.patchConfig({ radiusMiles: next });
    },
    [conn],
  );

  const handleZoomIn = useCallback(() => stepRadius(-1), [stepRadius]);
  const handleZoomOut = useCallback(() => stepRadius(1), [stepRadius]);

  // Drop a stale selection once the aircraft leaves the feed. A selection made
  // by flight search is exempt until the feed has had time to catch up: the
  // map has only just moved, so the aircraft won't appear until the next poll
  // and clearing it here would undo the search immediately.
  useEffect(() => {
    if (!selectedHex) return;
    if (state.aircraft.length === 0) return;
    if (state.aircraft.some((a) => a.hex === selectedHex)) {
      selectionGraceRef.current = 0;
      return;
    }
    if (selectionGraceRef.current > Date.now()) return;
    setSelectedHex(null);
  }, [state.aircraft, selectedHex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack keys while the location box has focus.
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape") setSelectedHex(null);
      if (e.key === "+" || e.key === "=") handleZoomIn();
      if (e.key === "-" || e.key === "_") handleZoomOut();
      if (e.key === "a" || e.key === "A") {
        conn.patchConfig({ showAirports: !configRef.current.showAirports });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleZoomIn, handleZoomOut, conn]);

  const cfg = state.config;
  if (!cfg) return <div className="boot">VECTOR</div>;

  return (
    <div className="display-root">
      <GeoMapLayer
        centerLat={cfg.centerLat}
        centerLon={cfg.centerLon}
        radiusMiles={cfg.radiusMiles}
        aircraft={state.aircraft}
        selectedAircraft={selectedAircraft}
        trails={state.trails}
        centerVersion={centerVersion}
        onClickAircraft={handleSelect}
        onReady={handleMapReady}
      />

      {render && (
        <AircraftCanvas
          map={render.map}
          motion={render.motion}
          labelled={render.labelled}
          aircraft={state.aircraft}
          selectedHex={selectedHex}
          glyphSize={26}
          showAirports={cfg.showAirports}
        />
      )}

      <LocationBox
        locationName={cfg.locationName}
        centerLat={cfg.centerLat}
        centerLon={cfg.centerLon}
        onPick={handlePickLocation}
        onPickFlight={handlePickFlight}
      />

      <CinematicOverlays
        locationName={cfg.locationName}
        centerLat={cfg.centerLat}
        centerLon={cfg.centerLon}
        radiusMiles={cfg.radiusMiles}
        aircraft={state.aircraft}
        connected={state.connected}
        source={state.status?.message ?? "airplanes.live"}
        now={state.now}
        selectedHex={selectedHex}
        onDeselect={handleDeselect}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onSelect={handleSelect}
      />
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
