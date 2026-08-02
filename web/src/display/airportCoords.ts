// Fallback airport coordinates for when the API doesn't provide originLat/Lon
// or destLat/Lon. Covers ~100 major airports relevant to Indian airspace.
// Coordinates: WGS-84 decimal degrees [lat, lon]. Sourced from OurAirports (CC0).

export const AIRPORT_COORDS: Record<string, [number, number]> = {
  // ===== India =====
  DEL: [28.5562, 77.1000], // Delhi
  BOM: [19.0887, 72.8679], // Mumbai
  BLR: [13.1986, 77.7066], // Bangalore
  MAA: [12.9941, 80.1709], // Chennai
  HYD: [17.2403, 78.4294], // Hyderabad
  CCU: [22.6547, 88.4467], // Kolkata
  COK: [10.1556, 76.3911], // Kochi
  AMD: [23.0772, 72.6347], // Ahmedabad
  GAU: [26.1061, 91.5859], // Guwahati
  PNQ: [18.5821, 73.9197], // Pune
  GOI: [15.3808, 73.8314], // Goa (Dabolim)
  GOX: [15.7444, 73.8649], // Goa (Mopa)
  ATQ: [31.7096, 74.7973], // Amritsar
  IXC: [30.6735, 76.7884], // Chandigarh
  IXJ: [32.6890, 74.8374], // Jammu
  IXE: [12.9613, 74.8900], // Mangaluru
  SXR: [33.9871, 74.7742], // Srinagar
  JAI: [26.8242, 75.8122], // Jaipur
  LKO: [26.7606, 80.8893], // Lucknow
  IXR: [23.3143, 85.3217], // Ranchi
  IXM: [9.8345, 78.0934],  // Madurai
  NAG: [21.0922, 79.0472], // Nagpur
  VTZ: [17.7212, 83.2245], // Visakhapatnam
  BBI: [20.2444, 85.8178], // Bhubaneswar
  IXB: [26.6812, 88.3286], // Bagdogra
  TRV: [8.4821, 76.9200],  // Thiruvananthapuram
  IXZ: [11.6411, 92.7297], // Port Blair
  PAT: [25.5913, 85.0880], // Patna
  IDR: [22.7218, 75.8011], // Indore
  RPR: [21.1804, 81.7388], // Raipur
  BHO: [23.2875, 77.3374], // Bhopal
  STV: [21.1141, 72.7411], // Surat
  HBX: [15.3617, 75.0848], // Hubli
  CJB: [11.0297, 77.0434], // Coimbatore
  TIR: [13.6325, 79.5433], // Tirupati
  IXL: [34.1359, 77.5465], // Leh
  HAN: [21.2214, 105.8067],// Hanoi (you had this earlier)

  // ===== Middle East =====
  DXB: [25.2528, 55.3644], // Dubai
  AUH: [24.4330, 54.6511], // Abu Dhabi
  DOH: [25.2731, 51.6080], // Doha
  RUH: [24.9576, 46.6988], // Riyadh
  JED: [21.6796, 39.1565], // Jeddah
  KWI: [29.2266, 47.9689], // Kuwait
  BAH: [26.2708, 50.6336], // Bahrain
  MCT: [23.5933, 58.2844], // Muscat
  SHJ: [25.3286, 55.5172], // Sharjah
  AMM: [31.7226, 35.9933], // Amman

  // ===== Europe =====
  LHR: [51.4700, -0.4543], // London Heathrow
  LGW: [51.1481, -0.1903], // London Gatwick
  CDG: [49.0097, 2.5479],  // Paris CDG
  FRA: [50.0379, 8.5622],  // Frankfurt
  AMS: [52.3086, 4.7639],  // Amsterdam
  MUC: [48.3538, 11.7861], // Munich
  ZRH: [47.4647, 8.5492],  // Zurich
  IST: [41.2753, 28.7519], // Istanbul
  FCO: [41.8003, 12.2389], // Rome
  MAD: [40.4936, -3.5668], // Madrid
  BCN: [41.2974, 2.0833],  // Barcelona
  VIE: [48.1103, 16.5697], // Vienna
  CPH: [55.6181, 12.6561], // Copenhagen
  HEL: [60.3172, 24.9633], // Helsinki
  SVO: [55.9726, 37.4146], // Moscow

  // ===== Asia =====
  SIN: [1.3644, 103.9915], // Singapore
  BKK: [13.6900, 100.7501],// Bangkok
  KUL: [2.7456, 101.7099], // Kuala Lumpur
  HKG: [22.3080, 113.9185],// Hong Kong
  ICN: [37.4602, 126.4407],// Seoul Incheon
  NRT: [35.7720, 140.3929],// Tokyo Narita
  HND: [35.5494, 139.7798],// Tokyo Haneda
  PEK: [40.0801, 116.5846],// Beijing
  PVG: [31.1443, 121.8083],// Shanghai
  CAN: [23.3924, 113.2988],// Guangzhou
  CMB: [7.1808, 79.8841],  // Colombo
  KTM: [27.6966, 85.3591], // Kathmandu
  DAC: [23.8431, 90.3978], // Dhaka
  RGN: [16.9073, 96.1332], // Yangon
  TPE: [25.0777, 121.2328],// Taipei
  MNL: [14.5086, 121.0194],// Manila

  // ===== North America =====
  JFK: [40.6398, -73.7789],// New York JFK
  EWR: [40.6925, -74.1687],// Newark
  LAX: [33.9425, -118.4081],// Los Angeles
  SFO: [37.6213, -122.3790],// San Francisco
  ORD: [41.9786, -87.9047],// Chicago
  IAD: [38.9531, -77.4565],// Washington Dulles
  YYZ: [43.6777, -79.6248],// Toronto
  YVR: [49.1939, -123.1839],// Vancouver

  // ===== Africa =====
  CAI: [30.1219, 31.4056], // Cairo
  ADD: [8.9779, 38.7993],  // Addis Ababa
  NBO: [-1.3192, 36.9278], // Nairobi
  JNB: [-26.1392, 28.2461],// Johannesburg

  // ===== Oceania =====
  SYD: [-33.9461, 151.1772],// Sydney
  MEL: [-37.6690, 144.8410],// Melbourne
  AKL: [-37.0082, 174.7917],// Auckland
};

/** Look up coordinates for an airport code (IATA). Returns null if unknown. */
export function lookupAirport(code: string | null | undefined): [number, number] | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return AIRPORT_COORDS[upper] ?? null;
}


/**
 * City / airport labels for the location picker, so people can search by place
 * name instead of having to know the IATA code. Keys mirror AIRPORT_COORDS.
 */
export const AIRPORT_NAMES: Record<string, string> = {
  DEL: "Delhi",
  BOM: "Mumbai",
  BLR: "Bangalore",
  MAA: "Chennai",
  HYD: "Hyderabad",
  CCU: "Kolkata",
  COK: "Kochi",
  AMD: "Ahmedabad",
  GAU: "Guwahati",
  PNQ: "Pune",
  GOI: "Goa (Dabolim)",
  GOX: "Goa (Mopa)",
  ATQ: "Amritsar",
  IXC: "Chandigarh",
  IXJ: "Jammu",
  IXE: "Mangaluru",
  SXR: "Srinagar",
  JAI: "Jaipur",
  LKO: "Lucknow",
  IXR: "Ranchi",
  IXM: "Madurai",
  NAG: "Nagpur",
  VTZ: "Visakhapatnam",
  BBI: "Bhubaneswar",
  IXB: "Bagdogra",
  TRV: "Thiruvananthapuram",
  IXZ: "Port Blair",
  PAT: "Patna",
  IDR: "Indore",
  RPR: "Raipur",
  BHO: "Bhopal",
  STV: "Surat",
  HBX: "Hubli",
  CJB: "Coimbatore",
  TIR: "Tirupati",
  IXL: "Leh",
  HAN: "Hanoi",
  DXB: "Dubai",
  AUH: "Abu Dhabi",
  DOH: "Doha",
  RUH: "Riyadh",
  JED: "Jeddah",
  KWI: "Kuwait",
  BAH: "Bahrain",
  MCT: "Muscat",
  SHJ: "Sharjah",
  AMM: "Amman",
  LHR: "London Heathrow",
  LGW: "London Gatwick",
  CDG: "Paris CDG",
  FRA: "Frankfurt",
  AMS: "Amsterdam",
  MUC: "Munich",
  ZRH: "Zurich",
  IST: "Istanbul",
  FCO: "Rome",
  MAD: "Madrid",
  BCN: "Barcelona",
  VIE: "Vienna",
  CPH: "Copenhagen",
  HEL: "Helsinki",
  SVO: "Moscow",
  SIN: "Singapore",
  BKK: "Bangkok",
  KUL: "Kuala Lumpur",
  HKG: "Hong Kong",
  ICN: "Seoul Incheon",
  NRT: "Tokyo Narita",
  HND: "Tokyo Haneda",
  PEK: "Beijing",
  PVG: "Shanghai",
  CAN: "Guangzhou",
  CMB: "Colombo",
  KTM: "Kathmandu",
  DAC: "Dhaka",
  RGN: "Yangon",
  TPE: "Taipei",
  MNL: "Manila",
  JFK: "New York JFK",
  EWR: "Newark",
  LAX: "Los Angeles",
  SFO: "San Francisco",
  ORD: "Chicago",
  IAD: "Washington Dulles",
  YYZ: "Toronto",
  YVR: "Vancouver",
  CAI: "Cairo",
  ADD: "Addis Ababa",
  NBO: "Nairobi",
  JNB: "Johannesburg",
  SYD: "Sydney",
  MEL: "Melbourne",
  AKL: "Auckland",
};

/** A short starter list shown before anyone has typed or picked anything. */
export const POPULAR_AIRPORTS = [
  "DEL", "BOM", "BLR", "MAA", "HYD", "CCU",
  "DXB", "SIN", "LHR", "JFK", "HKG", "SYD",
] as const;
