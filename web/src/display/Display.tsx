import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Config, Theme } from "@shared/index.js";
import { DEFAULT_CONFIG } from "@shared/index.js";
import { useStream } from "../lib/useStream.js";
import { Renderer } from "./renderer.js";
import { GeoMapLayer } from "./GeoMapLayer.js";
import { CinematicOverlays } from "./CinematicOverlays.js";
import { GeomapTuner } from "./GeomapTuner.js";
import { AIRPORT_OPTIONS } from "./airports";

const THEMES: Theme[] = ["ambient", "telemetry", "focus", "geomap"];

type AirportOption = (typeof AIRPORT_OPTIONS)[number];

const DEFAULT_AIRPORT =
  AIRPORT_OPTIONS.find((a) => a.code === "IXE") ?? AIRPORT_OPTIONS[0];

export function Display() {
  const { state, conn } = useStream("display");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const configRef = useRef<Config>(state.config ?? DEFAULT_CONFIG);
  configRef.current = state.config ?? DEFAULT_CONFIG;

  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [centerVersion, setCenterVersion] = useState(0);

  const [query, setQuery] = useState(DEFAULT_AIRPORT?.code ?? "");
  const [selectedAirport, setSelectedAirport] = useState<AirportOption | undefined>(DEFAULT_AIRPORT);
  const [airportSearchOpen, setAirportSearchOpen] = useState(false);

  const filteredAirports = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return AIRPORT_OPTIONS;

    return AIRPORT_OPTIONS.filter((a) => {
      const label = a.label?.toLowerCase() ?? "";
      const code = a.code.toLowerCase();
      return code.includes(q) || label.includes(q);
    });
  }, [query]);

  const selectedAircraft = useMemo(
    () => (selectedHex ? state.aircraft.find((a) => a.hex === selectedHex) ?? null : null),
    [selectedHex, state.aircraft],
  );

  const handleClickAircraft = useCallback((hex: string | null) => setSelectedHex(hex), []);
  const handleRecenter = useCallback(() => setCenterVersion((v) => v + 1), []);
  const handleDeselect = useCallback(() => setSelectedHex(null), []);

  const handleAirportSelect = useCallback(
    (airport: AirportOption) => {
      const [centerLat, centerLon] = airport.center;

      setSelectedAirport(airport);
      setQuery(airport.label ?? airport.code);
      setAirportSearchOpen(false);
      setSelectedHex(null);
      setCenterVersion((v) => v + 1);

      conn.patchConfig({
        centerLat,
        centerLon,
        locationName: airport.label ?? airport.code,
      });
    },
    [conn],
  );

  const handleZoomIn = useCallback(() => {
    const c = configRef.current;
    const next = Math.max(5, c.radiusMiles - (c.radiusMiles >= 50 ? 25 : c.radiusMiles >= 25 ? 15 : 5));
    conn.patchConfig({ radiusMiles: next });
  }, [conn]);

  const handleZoomOut = useCallback(() => {
    const c = configRef.current;
    const next = Math.min(150, c.radiusMiles + (c.radiusMiles >= 50 ? 25 : c.radiusMiles >= 25 ? 15 : 5));
    conn.patchConfig({ radiusMiles: next });
  }, [conn]);

  useEffect(() => {
    if (state.config?.theme !== "geomap" && selectedHex) setSelectedHex(null);
  }, [state.config?.theme, selectedHex]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const r = new Renderer(canvasRef.current, () => configRef.current);
    rendererRef.current = r;
    r.start();

    const onResize = () => r.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      r.stop();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.update(state.aircraft);
  }, [state.now, state.aircraft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = configRef.current;

      switch (e.key) {
        case "r":
          conn.patchConfig({ rotationDeg: (c.rotationDeg + 5) % 360 });
          break;
        case "R":
          conn.patchConfig({ rotationDeg: (c.rotationDeg - 5 + 360) % 360 });
          break;
        case "m":
          conn.patchConfig({ mirrorX: !c.mirrorX });
          break;
        case "M":
          conn.patchConfig({ mirrorY: !c.mirrorY });
          break;
        case "t": {
          const next = THEMES[(THEMES.indexOf(c.theme) + 1) % THEMES.length];
          conn.patchConfig({ theme: next });
          break;
        }
        case "[":
          conn.patchConfig({ radiusMiles: Math.max(0.5, c.radiusMiles - 0.5) });
          break;
        case "]":
          conn.patchConfig({ radiusMiles: c.radiusMiles + 0.5 });
          break;
        case "h":
          conn.patchConfig({ showHud: !c.showHud });
          break;
        case "Escape":
          setSelectedHex(null);
          setAirportSearchOpen(false);
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [conn]);

  const cfg = state.config;
  const geomap = cfg?.theme === "geomap";

  return (
    <div className={"display-root" + (geomap ? " theme-geomap" : "")}>
      <GeomapTuner />

      {geomap && (
        <div className="airport-selector">
          <input
            value={query}
            placeholder="Search airport..."
            onFocus={() => setAirportSearchOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setAirportSearchOpen(true);
            }}
          />

          {airportSearchOpen && (
            <div className="airport-list">
              {filteredAirports.map((a) => (
                <div
                  key={a.code}
                  className={"airport-item" + (selectedAirport?.code === a.code ? " active" : "")}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleAirportSelect(a);
                  }}
                >
                  {a.label ?? a.code}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {geomap && cfg && (
        <GeoMapLayer
          centerLat={cfg.centerLat}
          centerLon={cfg.centerLon}
          radiusMiles={cfg.radiusMiles}
          aircraft={state.aircraft}
          selectedAircraft={selectedAircraft}
          centerVersion={centerVersion}
          onClickAircraft={handleClickAircraft}
        />
      )}

      <canvas ref={canvasRef} className="display-canvas" />

      {geomap && cfg && (
        <CinematicOverlays
          locationName={cfg.locationName}
          centerLat={cfg.centerLat}
          centerLon={cfg.centerLon}
          aircraftCount={state.aircraft.length}
          radiusMiles={cfg.radiusMiles}
          aircraft={state.aircraft}
          connected={state.connected}
          source={state.status?.source ?? "AIRPLANES.LIVE"}
          now={state.now}
          selectedHex={selectedHex}
          onRecenter={handleRecenter}
          onDeselect={handleDeselect}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
      )}

      {cfg?.showHud && !geomap && (
        <div className="hud">
          <div className={"hud-dot " + (state.connected ? "ok" : "bad")} />
          <span>
            {state.status?.source ?? "-"} - {state.aircraft.length} ac - rot {cfg.rotationDeg} - mirror{" "}
            {cfg.mirrorX ? "X" : "-"}
            {cfg.mirrorY ? "Y" : ""} - r {cfg.radiusMiles}mi - {cfg.projectionMode} - {cfg.theme}
          </span>
        </div>
      )}

      {!state.connected && <div className="reconnect">connecting...</div>}
    </div>
  );
}