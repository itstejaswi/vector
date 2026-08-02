import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Config } from "@shared/index.js";
import { DEFAULT_CONFIG, MAX_RADIUS_MILES, MIN_RADIUS_MILES } from "@shared/index.js";
import { useStream } from "../lib/useStream.js";
import { useSmoothAircraft } from "../lib/useSmoothAircraft.js";
import { GeoMapLayer } from "./GeoMapLayer.js";
import { CinematicOverlays } from "./CinematicOverlays.js";
import { LocationBox } from "./LocationBox.js";

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

  // Positions advance between polls so aircraft glide instead of jumping.
  const aircraft = useSmoothAircraft(state.aircraft, state.now);

  const configRef = useRef<Config>(state.config ?? DEFAULT_CONFIG);
  configRef.current = state.config ?? DEFAULT_CONFIG;

  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [centerVersion, setCenterVersion] = useState(0);

  const selectedAircraft = useMemo(
    () => (selectedHex ? aircraft.find((a) => a.hex === selectedHex) ?? null : null),
    [selectedHex, aircraft],
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

  // Drop a stale selection once the aircraft leaves the feed.
  useEffect(() => {
    if (!selectedHex) return;
    if (state.aircraft.length === 0) return;
    if (!state.aircraft.some((a) => a.hex === selectedHex)) setSelectedHex(null);
  }, [state.aircraft, selectedHex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack keys while the location box has focus.
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape") setSelectedHex(null);
      if (e.key === "+" || e.key === "=") handleZoomIn();
      if (e.key === "-" || e.key === "_") handleZoomOut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleZoomIn, handleZoomOut]);

  const cfg = state.config;
  if (!cfg) return <div className="boot">INITIALISING…</div>;

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
      />

      <LocationBox
        locationName={cfg.locationName}
        centerLat={cfg.centerLat}
        centerLon={cfg.centerLon}
        onPick={handlePickLocation}
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
