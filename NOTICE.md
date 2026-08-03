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

- **airplanes.live** — live aircraft positions
- **adsbdb** — route and airframe lookups
- **Nominatim** / OpenStreetMap contributors — place-name geocoding
- **CARTO** and OpenStreetMap contributors — basemap tiles
- **OurAirports** (CC0) — airport coordinates
