# Vector

Live flight tracking for anywhere on Earth, in the browser. No server, no API
keys, no build-time secrets — just a static site that talks directly to public
aviation APIs.

Named for the heading a controller gives an aircraft — and for what every fix
really is: a direction and a magnitude. Point it at any coordinates, airport
code, or place name and watch the traffic overhead: altitude-coloured aircraft,
ground tracks, and the great-circle route of whichever flight you select.

## Features

- **Go anywhere.** Type `12.9613, 74.89`, `LHR`, or `Mangaluru` — coordinates
  and IATA codes resolve instantly from a local table, anything else through
  OpenStreetMap. Or press ⌖ to use your device's location.
- **Find a flight.** Type a callsign (`BAW172`), registration (`G-VIIN`) or
  ICAO hex and the map flies to that aircraft wherever it is on Earth, then
  selects it. Airport codes and place names are never mistaken for flights: a
  callsign always carries a digit, and `DEL` never does.
- **Live traffic.** Aircraft positions refresh every 3 seconds from
  airplanes.live, coloured by altitude band, with a fading ground track and
  climb/descent markers.
- **Route arcs.** Select a flight and the map flies out to show its full
  great-circle route, with origin and destination pinned.
- **Flight detail.** Airline, aircraft type, altitude, speed, distance, time to
  go, and status — enriched from adsbdb.
- **Local-first.** Your location, radius, and enrichment cache live in
  `localStorage`. Nothing is sent anywhere except the public APIs below.

## Running it

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Other scripts:

```bash
pnpm build        # production bundle into web/dist
pnpm preview      # serve the production build
pnpm test         # unit tests
pnpm typecheck    # tsc across both packages
```

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. Enable it once under
**Settings → Pages → Source → GitHub Actions**.

For a project site served from `https://<user>.github.io/<repo>/`, the workflow
passes the repository name as `BASE_PATH` so asset URLs resolve correctly. No
other configuration is needed.

The build is entirely static, so any host works — Netlify, Cloudflare Pages, S3,
or `npx serve web/dist`.

## How it works

```
browser
  ├── airplanes.live      aircraft positions      (CORS: *)
  │     ├── /point/…      everything in radius, polled every 3s
  │     └── /callsign|reg|hex/…   global flight search
  ├── adsbdb.com          route + type lookup     (CORS: *)
  ├── nominatim.osm.org   place-name geocoding    (CORS: *)
  └── CARTO basemap       dark raster tiles       (no key)
```

Every upstream sends `access-control-allow-origin: *`, which is what makes a
serverless build possible. Enrichment results — including negative lookups —
are cached in `localStorage` for 12 hours so the free APIs aren't hammered.

Flight search takes a different path from the map feed, which only ever returns
aircraft inside the current radius. A query shaped like a callsign, registration
or hex goes to the matching lookup endpoint; on a hit the map re-centres on that
aircraft and selects it, and its route lookup is allowed to jump the request
queue so a searched flight doesn't wait behind a hundred others.

### Layout

| Path              | What's in it                                          |
| ----------------- | ----------------------------------------------------- |
| `web/src/lib`     | Data feed, flight search, config, place resolution     |
| `web/src/display` | Map layer, HUD overlays, search box                    |
| `shared/src`      | Config schema, guard rails, geo and formatting helpers |

### Guard rails

Search radius is clamped to **5–200 km**. Coordinates are clamped and wrapped,
and any config restored from `localStorage` is sanitised before use, so corrupt
storage can't produce an unusable view or a rejected API call.

## Attribution

Aircraft data from [airplanes.live](https://airplanes.live). Route and airframe
data from [adsbdb](https://api.adsbdb.com). Geocoding by
[Nominatim](https://nominatim.openstreetmap.org) / OpenStreetMap contributors.
Basemap tiles © [CARTO](https://carto.com), © OpenStreetMap contributors.
Airport coordinates from [OurAirports](https://ourairports.com) (CC0).

The Vector logo is the "plane-departure" icon from
[Tabler Icons](https://tabler.io/icons), used under the MIT licence and
recoloured to the app's palette. It is scaled and inset to sit with some air in
the tile, and its stroke is lightened from Tabler's 2 to 1.5.
[`web/public/favicon.svg`](web/public/favicon.svg) is the source of truth, and
`BrandMark` in [`web/src/display/Icon.tsx`](web/src/display/Icon.tsx) mirrors
the same geometry so the browser tab and the app show the same mark. The PNG
sizes beside it are committed rather than generated at build time, which keeps
a native image dependency out of CI. To regenerate them after editing the SVG:

```bash
pnpm --dir web add -D sharp
node -e "const s=require('./web/node_modules/sharp'),f=require('fs'),v=f.readFileSync('web/public/favicon.svg');\
[[32,'favicon-32'],[192,'icon-192'],[512,'icon-512']].forEach(([n,o])=>s(v,{density:900}).resize(n,n).png().toFile('web/public/'+o+'.png'));\
s(v,{density:900}).resize(180,180).flatten({background:'#06070a'}).png().toFile('web/public/apple-touch-icon.png')"
pnpm --dir web remove sharp
```

The HUD's own symbols — the metric icons, the panel headers, the radar scope —
are drawn for this project rather than taken from a set. Every path is plain
geometry specified by coordinate. They live in
[`web/src/display/Icon.tsx`](web/src/display/Icon.tsx).

Vector was rebuilt from `cpaczek/skylight`, an RTL-SDR ceiling projector. The
server, tracker, Pi provisioning and projector renderer are gone; the data
layer, map, HUD, search and branding are new. Some of the original code
remains, and [NOTICE.md](NOTICE.md) records file by file exactly which.

## Licence

MIT — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
