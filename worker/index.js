/**
 * Vector's CORS shim.
 *
 * Free ADS-B networks stopped answering browsers in August 2026. adsb.lol
 * still serves the data - the same schema Vector was built around - but sends
 * no `access-control-allow-origin`, so a browser discards the response before
 * the page ever sees it. That is not something the page can work around: CORS
 * is enforced by the browser and only the server may relax it.
 *
 * This Worker sits in between and does exactly one thing: fetch, and add the
 * header. It reads nothing, stores nothing, and logs nothing.
 *
 * Deploy:
 *   npm create cloudflare@latest -- vector-feed
 *   # replace src/index.js with this file
 *   npx wrangler deploy
 *
 * Then paste the resulting URL into Vector's feed settings.
 *
 * The free tier allows 100,000 requests a day. Vector polls every 3 seconds
 * while a tab is open - roughly 28 tab-hours a day, far beyond what a personal
 * instance will ever use.
 */

/** Only these upstreams may be proxied, so this cannot become an open relay. */
const UPSTREAMS = {
  'adsb.lol': (lat, lon, radiusNm) =>
    `https://api.adsb.lol/v2/point/${lat}/${lon}/${radiusNm}`,
  'adsb.fi': (lat, lon, radiusNm) =>
    `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${radiusNm}`,
};

/**
 * Origins allowed to call this Worker.
 *
 * Empty means "any", which is fine for a personal instance. Fill it in if you
 * would rather your quota were not spent by someone else's fork.
 */
const ALLOWED_ORIGINS = [];

const MAX_RADIUS_NM = 250;

function corsHeaders(origin) {
  const allow =
    ALLOWED_ORIGINS.length === 0
      ? '*'
      : ALLOWED_ORIGINS.includes(origin)
        ? origin
        : null;
  if (!allow) return null;
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '86400',
    // The data changes constantly; a cached response would show aircraft that
    // have long since flown on.
    'cache-control': 'no-store',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('origin') ?? '';
    const cors = corsHeaders(origin);

    if (!cors) return new Response('Origin not allowed', { status: 403 });
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return json({ error: 'GET only' }, 405, cors);
    }

    const url = new URL(request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    const radius = Number(url.searchParams.get('radius'));
    const source = url.searchParams.get('source') ?? 'adsb.lol';

    // Validate rather than forward. A malformed coordinate would otherwise
    // become a malformed upstream request, and the upstream is a free service
    // that has already had enough of being taken for granted.
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return json({ error: 'lat must be between -90 and 90' }, 400, cors);
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      return json({ error: 'lon must be between -180 and 180' }, 400, cors);
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      return json({ error: 'radius must be a positive number' }, 400, cors);
    }
    const build = UPSTREAMS[source];
    if (!build) {
      return json(
        { error: `unknown source; try: ${Object.keys(UPSTREAMS).join(', ')}` },
        400,
        cors
      );
    }

    const upstream = build(lat, lon, Math.min(radius, MAX_RADIUS_NM));

    try {
      const res = await fetch(upstream, {
        headers: {
          // Identify the caller. Free feeds deserve to know who is asking, and
          // an anonymous scraper is exactly what they have been shutting out.
          'user-agent': 'vector-feed (github.com/itstejaswi/vector)',
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(9000),
      });

      if (!res.ok) return json({ error: `upstream ${res.status}` }, 502, cors);

      return new Response(res.body, {
        status: 200,
        headers: { 'content-type': 'application/json', ...cors },
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      return json(
        { error: timedOut ? 'upstream timed out' : 'upstream unreachable' },
        504,
        cors
      );
    }
  },
};
