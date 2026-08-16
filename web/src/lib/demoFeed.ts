// A captured minute of London airspace, replayed.
//
// Vector needs a feed key, and the networks that once answered browsers
// without one have all closed. That leaves a first-time visitor looking at an
// empty map and a paragraph of explanation, which is a poor way to show what
// the thing does.
//
// So this is real traffic - 26 aircraft around Heathrow, captured from
// adsb.lol - replayed with each aircraft advanced along its own heading at its
// own ground speed. Nothing is invented: the callsigns, registrations, types,
// altitudes and headings are as they were. Only time moves.
//
// It loops, and the HUD says DEMO throughout, because a demo pretending to be
// live would be exactly the sort of dishonesty the rest of this project goes
// out of its way to avoid.

import type { RawAircraft } from "./providers.js";

/** Where the capture was taken, so the map opens on the traffic. */
export const DEMO_CENTER = { lat: 51.47, lon: -0.4543, name: "London (LHR)" };

/** Seconds of replay before the loop returns to the captured positions. */
export const DEMO_LOOP_SECONDS = 900;

const CAPTURE: RawAircraft[] = [{"hex":"407840","flight":"GDBSB","lat":50.8491,"lon":-0.0710,"alt_baro":1725,"gs":83.7,"track":299.3,"baro_rate":0,"r":"G-DBSB","t":"TL20"},{"hex":"3452c9","flight":"VLG7112","lat":51.3762,"lon":-0.0739,"alt_baro":6400,"gs":258.1,"track":78.6,"baro_rate":-1408,"r":"EC-MNZ","t":"A320"},{"hex":"40780e","flight":"BAW331","lat":51.4625,"lon":-0.0597,"alt_baro":4500,"gs":185.0,"track":288.9,"baro_rate":-1024,"r":"G-NEOY","t":"A21N"},{"hex":"471efb","flight":"WZZ337","lat":51.1692,"lon":-0.0367,"alt_baro":1775,"gs":154.4,"track":258.0,"baro_rate":-704,"r":"HA-LTB","t":"A321"},{"hex":"405631","flight":"EZY67LM","lat":50.9621,"lon":-0.0484,"alt_baro":7000,"gs":234.8,"track":316.4,"baro_rate":-64,"r":"G-EZDA","t":"A319"},{"hex":"407f76","flight":"HLE27","lat":51.5182,"lon":-0.1550,"alt_baro":1150,"gs":116.0,"track":269.0,"baro_rate":256,"r":"G-LAAA","t":"EC35"},{"hex":"40690c","flight":"EZY72XB","lat":51.8527,"lon":-0.1714,"alt_baro":37975,"gs":381.9,"track":321.1,"baro_rate":64,"r":"G-EZWK","t":"A320"},{"hex":"40650b","flight":"CFE7032","lat":51.9482,"lon":-0.1264,"alt_baro":11850,"gs":276.8,"track":236.9,"baro_rate":2688,"r":"G-LCYO","t":"E190"},{"hex":"39c495","flight":"FBU47G","lat":52.1202,"lon":-0.0771,"alt_baro":36950,"gs":434.3,"track":328.2,"baro_rate":320,"r":"F-HREV","t":"A359"},{"hex":"4011c3","flight":"GSIRD","lat":51.8226,"lon":-0.1218,"alt_baro":1600,"gs":49.0,"track":37.0,"baro_rate":0,"r":"G-SIRD","t":"R44"},{"hex":"400afe","flight":"EFW59AU","lat":51.0466,"lon":0.0782,"alt_baro":6200,"gs":256.2,"track":70.9,"baro_rate":-384,"r":"G-EUXF","t":"A321"},{"hex":"3c5430","flight":"BCS2212","lat":51.6444,"lon":0.0491,"alt_baro":7050,"gs":232.2,"track":257.8,"baro_rate":-384,"r":"D-AEAP","t":"A306"},{"hex":"40814a","flight":"AUR8LG","lat":51.1875,"lon":0.0961,"alt_baro":3475,"gs":165.3,"track":258.5,"baro_rate":-832,"r":"G-PEMB","t":"AT76"},{"hex":"408051","flight":"EZY78QW","lat":50.9896,"lon":0.1540,"alt_baro":20725,"gs":357.3,"track":319.1,"baro_rate":-1920,"r":"G-UZLW","t":"A20N"},{"hex":"405955","flight":"GCFCT","lat":52.4046,"lon":0.1023,"alt_baro":1050,"gs":81.8,"track":122.5,"baro_rate":null,"r":"G-CFCT","t":"EV97"},{"hex":"405666","flight":"GCEZM","lat":52.0633,"lon":0.0046,"alt_baro":875,"gs":45.0,"track":312.0,"baro_rate":80,"r":"G-CEZM","t":"C152"},{"hex":"4010eb","flight":"EZY794E","lat":51.3353,"lon":-0.0112,"alt_baro":12025,"gs":343.1,"track":33.8,"baro_rate":2688,"r":"G-EZBW","t":"A319"},{"hex":"40799c","flight":"CFE27PM","lat":51.5700,"lon":0.0088,"alt_baro":2925,"gs":233.0,"track":55.5,"baro_rate":-192,"r":"G-LCAD","t":"E190"},{"hex":"4868a6","flight":"KLM77C","lat":51.5186,"lon":0.0130,"alt_baro":6125,"gs":199.2,"track":173.7,"baro_rate":-1280,"r":"PH-NXY","t":"E295"},{"hex":"400dae","flight":"EZY18YZ","lat":50.9219,"lon":0.0121,"alt_baro":8575,"gs":238.8,"track":334.2,"baro_rate":-1024,"r":"G-EZAJ","t":"A319"},{"hex":"440179","flight":"EJU61EM","lat":51.1504,"lon":-0.1736,"alt_baro":125,"gs":135.1,"track":257.6,"baro_rate":-512,"r":"OE-LQJ","t":"A319"},{"hex":"401b33","flight":"GILZZ","lat":51.2766,"lon":-0.2665,"alt_baro":2150,"gs":149.9,"track":245.1,"baro_rate":null,"r":"G-ILZZ","t":"PA31"},{"hex":"406c72","flight":"EZY13HY","lat":50.7288,"lon":-0.2843,"alt_baro":26425,"gs":463.5,"track":146.6,"baro_rate":1344,"r":"G-EZWZ","t":"A320"},{"hex":"4d24eb","flight":"RYR9AH","lat":52.3904,"lon":-0.2506,"alt_baro":21825,"gs":435.2,"track":91.6,"baro_rate":1920,"r":"9H-VVM","t":"B38M"},{"hex":"4010dc","flight":"EFW16EA","lat":51.1404,"lon":-0.2473,"alt_baro":1950,"gs":171.2,"track":258.9,"baro_rate":1408,"r":"G-EUXL","t":"A321"},{"hex":"4cadc4","flight":"RYR3EB","lat":51.6716,"lon":-0.2479,"alt_baro":22450,"gs":391.5,"track":321.6,"baro_rate":-1024,"r":"EI-IGG","t":"B38M"}];

const KM_PER_NM = 1.852;
const EARTH_KM = 6371;

/**
 * Advance the capture by `seconds`.
 *
 * Each aircraft is moved along its recorded track at its recorded ground
 * speed - dead reckoning, which is what the real feed's own interpolation
 * does between updates. Over a fifteen-minute loop the paths stay plausible;
 * beyond that they would drift into fiction, which is why it loops.
 */
export function demoFrame(seconds: number): RawAircraft[] {
  const t = ((seconds % DEMO_LOOP_SECONDS) + DEMO_LOOP_SECONDS) % DEMO_LOOP_SECONDS;

  return CAPTURE.map((ac) => {
    const gs = typeof ac.gs === "number" ? ac.gs : 0;
    const track = typeof ac.track === "number" ? ac.track : 0;
    if (!gs || ac.alt_baro === "ground") return { ...ac, seen: 0 };

    // Ground speed is in knots; convert to kilometres covered in t seconds.
    const km = (gs * KM_PER_NM * t) / 3600;
    const bearing = (track * Math.PI) / 180;
    const lat0 = ((ac.lat ?? 0) * Math.PI) / 180;
    const lon0 = ((ac.lon ?? 0) * Math.PI) / 180;
    const d = km / EARTH_KM;

    const lat1 = Math.asin(
      Math.sin(lat0) * Math.cos(d) + Math.cos(lat0) * Math.sin(d) * Math.cos(bearing)
    );
    const lon1 =
      lon0 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(lat0),
        Math.cos(d) - Math.sin(lat0) * Math.sin(lat1)
      );

    // Climb and descent carry on too, so the altitude readouts are not frozen
    // while everything else moves.
    const rate = typeof ac.baro_rate === "number" ? ac.baro_rate : 0;
    const alt =
      typeof ac.alt_baro === "number"
        ? Math.max(0, Math.round(ac.alt_baro + (rate * t) / 60))
        : ac.alt_baro;

    return {
      ...ac,
      lat: (lat1 * 180) / Math.PI,
      lon: (((lon1 * 180) / Math.PI + 540) % 360) - 180,
      alt_baro: alt,
      seen: 0,
    };
  });
}