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
import { AIRPORT_COORDS, AIRPORT_NAMES, POPULAR_AIRPORTS } from "./airportCoords.js";

interface Props {
  locationName: string;
  centerLat: number;
  centerLon: number;
  onPick: (lat: number, lon: number, name: string) => void;
}

interface Suggestion {
  label: string;
  sub: string;
  detail: string;
  lat: number;
  lon: number;
  kind: "coords" | "airport" | "recent";
}

/**
 * Pull an airport code out of a saved place name. Recents are stored as free
 * text, either a bare code from an older build or "Chennai (MAA)" from this
 * one, so both shapes have to resolve for dedupe and labelling to work.
 */
function codeFromName(name: string): string | null {
  const paren = /\(([A-Z]{3})\)\s*$/.exec(name.trim().toUpperCase());
  if (paren && AIRPORT_COORDS[paren[1]]) return paren[1];
  const bare = name.trim().toUpperCase();
  return AIRPORT_COORDS[bare] ? bare : null;
}

/** Build a suggestion for an airport code, or null if we don't know it. */
function airportSuggestion(code: string): Suggestion | null {
  const coords = AIRPORT_COORDS[code];
  if (!coords) return null;
  return {
    label: code,
    sub: AIRPORT_NAMES[code] ?? "",
    detail: formatCoords(coords[0], coords[1]),
    lat: coords[0],
    lon: coords[1],
    kind: "airport",
  };
}

/**
 * Rank airports against a query. An exact code wins, then a code prefix, then
 * a city-name prefix, then a city-name substring — so typing "mum" finds
 * Mumbai and "del" still puts DEL first.
 */
function searchAirports(query: string): Suggestion[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const scored: Array<{ code: string; rank: number }> = [];

  for (const code of Object.keys(AIRPORT_COORDS)) {
    const name = (AIRPORT_NAMES[code] ?? "").toUpperCase();
    let rank = -1;
    if (code === q) rank = 0;
    else if (code.startsWith(q)) rank = 1;
    else if (name.startsWith(q)) rank = 2;
    else if (name.includes(q)) rank = 3;
    if (rank >= 0) scored.push({ code, rank });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code))
    .slice(0, 7)
    .map(({ code }) => airportSuggestion(code))
    .filter((s): s is Suggestion => s !== null);
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

  // Close on outside tap. pointerdown covers mouse and touch alike.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = query.trim();

    // Nothing typed: offer recents first, then popular airports to fill out
    // the list. On a fresh phone there are no recents, so without this the
    // panel would open empty and there'd be nothing to tap.
    if (!q) {
      const seen = new Set<string>();
      const items: Suggestion[] = [];
      // Dedupe on position rather than name: the same airport can sit in
      // recents under a bare code from an older build and as "Mumbai (BOM)"
      // from this one, and both must collapse to a single row.
      const key = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

      for (const r of recents) {
        if (seen.has(key(r.lat, r.lon))) continue;
        seen.add(key(r.lat, r.lon));
        const code = codeFromName(r.name);
        items.push({
          label: code ?? r.name,
          sub: code ? AIRPORT_NAMES[code] ?? "" : "",
          detail: formatCoords(r.lat, r.lon),
          lat: r.lat,
          lon: r.lon,
          kind: "recent",
        });
      }

      for (const code of POPULAR_AIRPORTS) {
        if (items.length >= 8) break;
        const s = airportSuggestion(code);
        if (!s || seen.has(key(s.lat, s.lon))) continue;
        seen.add(key(s.lat, s.lon));
        items.push(s);
      }
      return items;
    }

    const coords = parseCoords(q);
    if (coords) {
      return [
        {
          label: formatCoords(coords.lat, coords.lon),
          sub: "",
          detail: "Go to coordinates",
          lat: coords.lat,
          lon: coords.lon,
          kind: "coords",
        },
      ];
    }

    return searchAirports(q);
  }, [query, recents]);

  const headline = query.trim() ? "Matches" : recents.length ? "Recent & popular" : "Popular";

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
          // Focus alone isn't enough: after picking a place the input keeps
          // focus, so a second tap fires no focus event and the list would
          // never reopen.
          onPointerDown={() => setOpen(true)}
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
            onPointerDown={(e) => {
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
              <div className="loc-head">{headline}</div>
              <div className="loc-list">
                {suggestions.map((s) => (
                  <button
                    type="button"
                    key={`${s.kind}-${s.label}-${s.lat}-${s.lon}`}
                    className="loc-item"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      commit(s.lat, s.lon, s.sub ? `${s.sub} (${s.label})` : s.label);
                    }}
                  >
                    <span className="loc-item-main">
                      <span className="loc-item-label">{s.label}</span>
                      {s.sub && <span className="loc-item-sub">{s.sub}</span>}
                    </span>
                    <span className="loc-item-detail">{s.detail}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {query.trim() && (
            <button
              type="button"
              className="loc-search"
              onPointerDown={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              Search "{query.trim()}" worldwide
            </button>
          )}

          <div className="loc-hint">
            City, airport code, or coordinates
            {GEOLOCATION_SUPPORTED && " · ⌖ my location"}
          </div>
        </div>
      )}
    </div>
  );
}
