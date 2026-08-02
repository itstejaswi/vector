// Normalized aircraft model. Positions arrive from airplanes.live and are
// mapped into this single shape, so nothing downstream cares about the
// upstream's field names.

export interface Aircraft {
  /** 24-bit ICAO address — the stable key for everything. */
  hex: string;
  /** Callsign, trimmed (e.g. "UAL1234"). */
  flight?: string;

  lat?: number;
  lon?: number;
  /** Barometric altitude in feet, or null when on ground. */
  altBaro?: number | null;
  /** Geometric altitude in feet. */
  altGeom?: number | null;
  /** Ground speed, knots. */
  gs?: number;
  /** Track / heading over ground, degrees. */
  track?: number;
  /** Vertical rate, ft/min (positive = climbing). */
  baroRate?: number | null;
  /** ADS-B emitter category, used as a fallback when classifying the glyph. */
  category?: string;
  onGround?: boolean;

  /** Registration. */
  registration?: string;
  /** ICAO type code, e.g. "B738". */
  typeCode?: string;

  /** Seconds since the last message for this aircraft. */
  seen?: number;

  // --- enrichment (looked up from adsbdb) ---
  /** Human type name, e.g. "Boeing 737-800". */
  typeName?: string;
  airline?: string;
  origin?: string;
  destination?: string;
  /** Origin / destination city names and coordinates, for the route arc. */
  originName?: string;
  destName?: string;
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;

  /** Timestamp (ms) of the snapshot this fix came from. */
  ts?: number;
}
