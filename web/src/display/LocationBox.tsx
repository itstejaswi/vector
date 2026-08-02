import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatCoords,
  GEOLOCATION_SUPPORTED,
  loadRecents,
  locateMe,
  parseCoords,
  pushRecent,
  resolvePlace,
  type RecentPlace,
} from "../lib/places.js";
import { AIRPORT_COORDS } from "./airportCoords.js";

interface Props {
  locationName: string;
  centerLat: number;
  centerLon: number;
  onPick: (lat: number, lon: number, name: string) => void;
}

interface Suggestion {
  label: string;
  detail: string;
  lat: number;
  lon: number;
  kind: "coords" | "airport" | "recent";
}

/**
 * Smart location box. Accepts decimal coordinates, an airport code, or any
 * place name — coordinates and codes resolve instantly from local tables,
 * anything else goes to Nominatim on submit.
 */
export function LocationBox({ locationName, centerLat, centerLon, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentPlace[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setRecents(loadRecents()), []);

  // Close on outside click so the panel doesn't linger over the map.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = query.trim();

    if (!q) {
      return recents.map((r) => ({
        label: r.name,
        detail: formatCoords(r.lat, r.lon),
        lat: r.lat,
        lon: r.lon,
        kind: "recent" as const,
      }));
    }

    const coords = parseCoords(q);
    if (coords) {
      return [
        {
          label: formatCoords(coords.lat, coords.lon),
          detail: "Go to coordinates",
          lat: coords.lat,
          lon: coords.lon,
          kind: "coords" as const,
        },
      ];
    }

    const upper = q.toUpperCase();
    return Object.entries(AIRPORT_COORDS)
      .filter(([code]) => code.startsWith(upper))
      .slice(0, 6)
      .map(([code, [lat, lon]]) => ({
        label: code,
        detail: formatCoords(lat, lon),
        lat,
        lon,
        kind: "airport" as const,
      }));
  }, [query, recents]);

  const commit = useCallback(
    (lat: number, lon: number, name: string) => {
      onPick(lat, lon, name);
      setRecents(pushRecent({ name, lat, lon }));
      setQuery("");
      setOpen(false);
      setError(null);
    },
    [onPick],
  );

  const submit = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const place = await resolvePlace(q);
      commit(place.lat, place.lon, place.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find that place");
    } finally {
      setBusy(false);
    }
  }, [query, commit]);

  const useMyLocation = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const place = await locateMe();
      commit(place.lat, place.lon, place.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get your location");
    } finally {
      setBusy(false);
    }
  }, [commit]);

  return (
    <div className="loc-box" ref={rootRef}>
      <div className="loc-field">
        <span className="loc-icon" aria-hidden="true">
          ◎
        </span>
        <input
          value={query}
          spellCheck={false}
          placeholder={locationName || "Search location"}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        {busy && <span className="loc-spinner" aria-label="Searching" />}
        {GEOLOCATION_SUPPORTED && !busy && (
          <button
            type="button"
            className="loc-gps"
            title="Use my location"
            aria-label="Use my location"
            onMouseDown={(e) => {
              e.preventDefault();
              void useMyLocation();
            }}
          >
            ⌖
          </button>
        )}
      </div>

      <div className="loc-current">{formatCoords(centerLat, centerLon)}</div>

      {open && (
        <div className="loc-panel">
          {error && <div className="loc-error">{error}</div>}

          {suggestions.length > 0 && (
            <>
              <div className="loc-head">
                {query.trim() ? "Matches" : recents.length ? "Recent" : ""}
              </div>
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={`${s.kind}-${s.label}-${s.lat}-${s.lon}`}
                  className="loc-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(s.lat, s.lon, s.label);
                  }}
                >
                  <span className="loc-item-label">{s.label}</span>
                  <span className="loc-item-detail">{s.detail}</span>
                </button>
              ))}
            </>
          )}

          {query.trim() && (
            <button
              type="button"
              className="loc-search"
              onMouseDown={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              Search "{query.trim()}" worldwide
            </button>
          )}

          <div className="loc-hint">
            Coordinates · airport code · place name
            {GEOLOCATION_SUPPORTED && " · ⌖ my location"}
          </div>
        </div>
      )}
    </div>
  );
}
