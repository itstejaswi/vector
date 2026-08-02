// Airport geometry, drawn at true geographic position so departures and
// arrivals visibly line up with the runways. Coordinates from OurAirports.
// Now includes SFO (legacy reference) + major Indian airports.
import { AIRPORT_COORDS } from "./airportCoords";

export const AIRPORT_OPTIONS = Object.entries(AIRPORT_COORDS).map(
  ([code, coords]) => ({
    code,
    label: code,
    center: coords
  })
);
``
export interface Runway {
  leIdent: string;
  heIdent: string;
  le: [number, number]; // [lat, lon]
  he: [number, number];
  widthFt: number;
}

export interface Airport {
  icao: string;
  name: string;
  runways: Runway[];
}

export const SFO: Airport = {
  icao: "KSFO",
  name: "SFO",
  runways: [
    { leIdent: "10L", heIdent: "28R", le: [37.628742, -122.39341], he: [37.613538, -122.35716], widthFt: 200 },
    { leIdent: "10R", heIdent: "28L", le: [37.626298, -122.393124], he: [37.61172, -122.358367], widthFt: 200 },
    { leIdent: "1L", heIdent: "19R", le: [37.607898, -122.38295], he: [37.626476, -122.37063], widthFt: 200 },
    { leIdent: "1R", heIdent: "19L", le: [37.606333, -122.381061], he: [37.627346, -122.367124], widthFt: 200 },
  ],
};

/** Indira Gandhi International, Delhi. */
/** Indira Gandhi International, Delhi. */
export const DEL: Airport = {
  icao: "VIDP",
  name: "DEL",
  runways: [
    // 10/28 - main, southernmost (heading ~96/276)
    { leIdent: "10", heIdent: "28", le: [28.5621, 77.0852], he: [28.5575, 77.1238], widthFt: 197 },
    // 11R/29L - longest 4430m, primary ops
    { leIdent: "11R", heIdent: "29L", le: [28.5598, 77.0859], he: [28.5398, 77.1240], widthFt: 197 },
    // 11L/29R - new parallel (opened 2023)
    { leIdent: "11L", heIdent: "29R", le: [28.5777, 77.0826], he: [28.5570, 77.1170], widthFt: 197 },
  ],
};

/** Chhatrapati Shivaji Maharaj International, Mumbai. */
export const BOM: Airport = {
  icao: "VABB",
  name: "BOM",
  runways: [
    { leIdent: "09", heIdent: "27", le: [19.0959, 72.8576], he: [19.0875, 72.8946], widthFt: 200 },
    { leIdent: "14", heIdent: "32", le: [19.1085, 72.8588], he: [19.0768, 72.8845], widthFt: 200 },
  ],
};

/** Kempegowda International, Bangalore. */
export const BLR: Airport = {
  icao: "VOBL",
  name: "BLR",
  runways: [
    { leIdent: "09L", heIdent: "27R", le: [13.2079, 77.6862], he: [13.1990, 77.7195], widthFt: 150 },
    { leIdent: "09R", heIdent: "27L", le: [13.1948, 77.6912], he: [13.1857, 77.7244], widthFt: 150 },
  ],
};

/** Rajiv Gandhi International, Hyderabad. */
export const HYD: Airport = {
  icao: "VOHS",
  name: "HYD",
  runways: [
    { leIdent: "09L", heIdent: "27R", le: [17.2478, 78.4193], he: [17.2350, 78.4555], widthFt: 150 },
  ],
};

/** Chennai International. */
export const MAA: Airport = {
  icao: "VOMM",
  name: "MAA",
  runways: [
    { leIdent: "07", heIdent: "25", le: [12.9879, 80.1612], he: [13.0045, 80.1860], widthFt: 150 },
    { leIdent: "12", heIdent: "30", le: [13.0028, 80.1697], he: [12.9788, 80.1810], widthFt: 150 },
  ],
};

/** Mangaluru International. */
export const IXE: Airport = {
  icao: "VOML",
  name: "IXE",
  runways: [
    { leIdent: "09", heIdent: "27", le: [12.9595, 74.8820], he: [12.9648, 74.8979], widthFt: 150 },
  ],
};

/** Goa International (GOI / VOGO). */
export const GOI: Airport = {
  icao: "VOGO",
  name: "GOI",
  runways: [
    { leIdent: "08", heIdent: "26", le: [15.3744, 73.8357], he: [15.3849, 73.8546], widthFt: 150 },
  ],
};

/** Dubai International (DXB / OMDB). */
export const DXB: Airport = {
  icao: "OMDB",
  name: "DXB",
  runways: [
    { leIdent: "12L", heIdent: "30R", le: [25.2385, 55.3577], he: [25.2536, 55.3853], widthFt: 200 },
    { leIdent: "12R", heIdent: "30L", le: [25.2450, 55.3510], he: [25.2600, 55.3787], widthFt: 200 },
  ],
};

/** John F Kennedy International (JFK / KJFK). */
export const JFK: Airport = {
  icao: "KJFK",
  name: "JFK",
  runways: [
    { leIdent: "04L", heIdent: "22R", le: [40.6398, -73.7789], he: [40.6176, -73.7622], widthFt: 200 },
    { leIdent: "04R", heIdent: "22L", le: [40.6445, -73.7822], he: [40.6222, -73.7655], widthFt: 200 },
    { leIdent: "13L", heIdent: "31R", le: [40.6517, -73.7812], he: [40.6300, -73.7485], widthFt: 200 },
    { leIdent: "13R", heIdent: "31L", le: [40.6463, -73.7897], he: [40.6245, -73.7568], widthFt: 200 },
  ],
};


/** All airports the renderer will try to draw. Only the ones near your current
 *  centerLat/centerLon will actually appear on screen. */
export const AIRPORTS: Airport[] = [
  SFO,
  DEL,
  BOM,
  BLR,
  HYD,
  MAA,
  IXE,
  GOI,
  DXB,
  JFK
];
