# Third-party notices

Vector is MIT licensed. It also carries work from the projects below, each
used under its own permissive licence. This file records exactly what came
from where, so the credit is specific rather than a blanket acknowledgement.

## Code

**cpaczek/skylight** — MIT

Vector started from this project and was rebuilt as a browser-only tracker: the
Node server, the RTL-SDR tracker, the Raspberry Pi provisioning and the
projector renderer are all gone, and the data layer, map, HUD, search and
branding are new. Some of the original remains, though, and MIT requires the
notice be kept wherever it does:

| File | Retained |
| ---- | -------- |
| `web/src/display/aircraftGlyph.ts` | Substantially original — the animated aircraft artwork |
| `shared/src/format.ts` | Mostly original |
| `tsconfig.base.json` | Unchanged |
| `shared/src/aircraft.ts` | Type definitions, since extended |
| `web/src/styles/display.css` | Design tokens and reset; the rest is new |

Everything else in the tree is either new or has been rewritten far enough that
little of the original survives.

## Artwork

**Tabler Icons** — MIT

The Vector logo is Tabler's `plane-departure`, recoloured and with its stroke
lightened. The flight-phase icons in the traffic list are `plane-departure`,
`plane-arrival` and `plane-inflight`.

Every other icon in the HUD is drawn for this project.

## Data and tiles

These are services rather than bundled code, credited in-app as their terms
require:

- **AirLabs** — live aircraft positions, when a key is configured
- **adsb.lol** — live aircraft positions, via a shim you host
- **airplanes.live** — live aircraft positions (see the note below)
- **adsbdb** — route and airframe lookups
- **Nominatim** / OpenStreetMap contributors — place-name geocoding
- **CARTO** and OpenStreetMap contributors — basemap tiles
- **OurAirports** (CC0) — airport coordinates

### A note on the position feed

Vector was built on airplanes.live, whose API was open to browsers and needed
no key. In August 2026 that changed, and not only there: every free ADS-B
network closed browser access within roughly the same window.

| Service | What it does now |
| ------- | ---------------- |
| airplanes.live | 403 to every request, browser or not |
| adsb.lol | Serves data, sends no `access-control-allow-origin` |
| adsb.fi | Serves data, sends no `access-control-allow-origin` |
| OpenSky | `access-control-allow-origin: https://opensky-network.org` — its own site only |
| AirLabs | Sends the header, and issues free keys from a waiting list |

None of that is something a browser can work around. CORS is enforced by the
browser and only the API's owner can relax it. There are two ways back:

**An AirLabs key.** They answer browsers directly. Registration runs from a
waiting list, and the key goes in the feed panel.

**A shim you host.** adsb.lol still serves the data to anyone who asks, just
not to a browser. `worker/index.js` is a small Cloudflare Worker that fetches
from adsb.lol and adds the one header a browser needs — nothing else.

**Neither is bundled with this repository.** That is deliberate: the project is
public and MIT licensed, so a shipped key or address would become everyone's,
and land whichever service it points at with traffic from every fork at once.
The same reasoning is why the Worker sends a `user-agent` naming this project —
a free feed deserves to know who is calling it.

Thanks are owed to all of these operators regardless. Running a public ADS-B
network is expensive and largely thankless, and a hobby project like this one
exists entirely on their generosity.

### The demo

A visitor with no feed configured sees a captured minute of London airspace
replayed rather than an empty map — 26 aircraft from adsb.lol, advanced along
their own headings at their own ground speeds. The callsigns, registrations,
types and altitudes are exactly as they were recorded; only time moves. It
loops every fifteen minutes and the HUD reads DEMO throughout, because a
recording pretending to be live would be precisely the dishonesty the rest of
this file goes out of its way to avoid.



