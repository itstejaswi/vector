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
  ├── adsbdb.com          route + type lookup     (CORS: *)
  ├── nominatim.osm.org   place-name geocoding    (CORS: *)
  └── CARTO basemap       dark raster tiles       (no key)
```

Every upstream sends `access-control-allow-origin: *`, which is what makes a
serverless build possible. Enrichment results — including negative lookups —
are cached in `localStorage` for 12 hours so the free APIs aren't hammered.

### Layout

| Path              | What's in it                                          |
| ----------------- | ----------------------------------------------------- |
| `web/src/lib`     | Data feed, config persistence, place resolution        |
| `web/src/display` | Map layer, HUD overlays, location box                  |
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

Vector began as a fork of
[cpaczek/skylight](https://github.com/cpaczek/skylight), an RTL-SDR ceiling
projector, and was rebuilt as a browser-only tracker. The original MIT licence
and copyright are retained in [LICENSE](LICENSE).

## Licence

MIT — see [LICENSE](LICENSE).
