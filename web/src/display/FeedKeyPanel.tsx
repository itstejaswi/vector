import { useEffect, useState } from "react";
import { Icon } from "./Icon.js";

interface Props {
  feedProxy: string;
  onSave: (url: string) => void;
}

const REPO = "https://github.com/itstejaswi/vector";

/**
 * Feed panel.
 *
 * Shown only when the position feed is failing, because until August 2026 it
 * had no reason to exist: airplanes.live answered browsers without a key and
 * the app had nothing to configure. Then every free ADS-B network closed
 * browser access at once.
 *
 * The data is still public - adsb.lol serves it openly - but without an
 * `access-control-allow-origin` header the browser discards the response
 * before the page sees it, and only the server can change that. So the fix is
 * a small shim the visitor runs themselves, and this panel is where its URL
 * goes.
 *
 * It is deliberately not a permanent settings pane. Nobody opens a flight
 * tracker wanting to think about infrastructure, so the panel appears when
 * there is a problem it can solve and goes away once aircraft are on screen.
 */
export function FeedKeyPanel({ feedProxy, onSave }: Props) {
  const [value, setValue] = useState(feedProxy);
  const [open, setOpen] = useState(false);

  // Reflect a URL set elsewhere (another tab, a reset) without clobbering
  // whatever is being typed here.
  useEffect(() => {
    if (!open) setValue(feedProxy);
  }, [feedProxy, open]);

  function save() {
    onSave(value.trim());
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="feedkey-open"
        onClick={() => setOpen(true)}
      >
        <Icon name="status" size={13} />
        <span>Why is the map empty?</span>
      </button>
    );
  }

  return (
    <div className="feedkey">
      <div className="feedkey-head">
        <strong>The feed closed its doors</strong>
        <button
          type="button"
          className="feedkey-close"
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      <p className="feedkey-body">
        Vector read positions from airplanes.live, which was open to browsers
        and needed no key. In August 2026 that changed, and every other free
        ADS-B network closed browser access at about the same time.
      </p>
      <p className="feedkey-body">
        The data is still public. adsb.lol serves it to anyone who asks - just
        not to a browser, because it sends no CORS header and only the server
        can change that.
      </p>
      <p className="feedkey-body">
        The way round it is a shim you run yourself:{" "}
        <a
          href={`${REPO}/blob/main/worker/index.js`}
          target="_blank"
          rel="noreferrer"
        >
          worker/index.js
        </a>{" "}
        is about a hundred lines, free to run on Cloudflare, and does nothing
        but fetch and add the header. Deploy it, then paste the URL here.
      </p>

      <div className="feedkey-row">
        <input
          type="url"
          className="feedkey-input"
          value={value}
          placeholder="https://your-worker.workers.dev"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <button type="button" className="feedkey-save" onClick={save}>
          Save
        </button>
      </div>

      {feedProxy && (
        <button
          type="button"
          className="feedkey-clear"
          onClick={() => {
            setValue("");
            onSave("");
          }}
        >
          Forget this address
        </button>
      )}
    </div>
  );
}
