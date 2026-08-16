import { useEffect, useState } from "react";
import { Icon } from "./Icon.js";

interface Props {
  apiKey: string;
  feedProxy: string;
  onSave: (patch: { apiKey?: string; feedProxy?: string }) => void;
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
 * Two routes back, so the panel offers both: an AirLabs key, which is the
 * short one, or a shim the visitor hosts for themselves, which needs no
 * account. Whichever is filled in is the one that gets used.
 *
 * It is deliberately not a permanent settings pane. Nobody opens a flight
 * tracker wanting to think about credentials, so the panel appears when there
 * is a problem it can solve and goes away once aircraft are on screen.
 */
export function FeedKeyPanel({ apiKey, feedProxy, onSave }: Props) {
  const [tab, setTab] = useState<"key" | "proxy">(
    feedProxy && !apiKey ? "proxy" : "key"
  );
  const [key, setKey] = useState(apiKey);
  const [proxy, setProxy] = useState(feedProxy);
  const [open, setOpen] = useState(false);

  // Reflect values set elsewhere (another tab, a reset) without clobbering
  // whatever is being typed here.
  useEffect(() => {
    if (open) return;
    setKey(apiKey);
    setProxy(feedProxy);
  }, [apiKey, feedProxy, open]);

  function save() {
    // Saving one route clears the other, so the HUD cannot claim a source the
    // app is not actually reading from.
    onSave(
      tab === "key"
        ? { apiKey: key.trim(), feedProxy: "" }
        : { feedProxy: proxy.trim(), apiKey: "" }
    );
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
        ADS-B network closed browser access at about the same time. Only the
        service can allow a browser to call it, so there are two ways back.
      </p>

      <div className="feedkey-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="feedkey-tab"
          aria-selected={tab === "key"}
          onClick={() => setTab("key")}
        >
          AirLabs key
        </button>
        <button
          type="button"
          role="tab"
          className="feedkey-tab"
          aria-selected={tab === "proxy"}
          onClick={() => setTab("proxy")}
        >
          Your own shim
        </button>
      </div>

      {tab === "key" ? (
        <>
          <p className="feedkey-body">
            AirLabs answers browsers directly.{" "}
            <a href="https://airlabs.co" target="_blank" rel="noreferrer">
              Ask for a free key
            </a>{" "}
            - they run a waiting list - then paste it below. It stays in this
            browser and is sent only to AirLabs.
          </p>
          <div className="feedkey-row">
            <input
              type="password"
              className="feedkey-input"
              value={key}
              placeholder="AirLabs API key"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setOpen(false);
              }}
            />
            <button type="button" className="feedkey-save" onClick={save}>
              Save
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="feedkey-body">
            adsb.lol serves the data to anyone who asks - just not to a browser.{" "}
            <a
              href={`${REPO}/blob/main/worker/index.js`}
              target="_blank"
              rel="noreferrer"
            >
              worker/index.js
            </a>{" "}
            is about a hundred lines, free to run on Cloudflare, and does
            nothing but fetch and add the missing header.
          </p>
          <div className="feedkey-row">
            <input
              type="url"
              className="feedkey-input"
              value={proxy}
              placeholder="https://your-worker.workers.dev"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setProxy(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setOpen(false);
              }}
            />
            <button type="button" className="feedkey-save" onClick={save}>
              Save
            </button>
          </div>
        </>
      )}

      {(apiKey || feedProxy) && (
        <button
          type="button"
          className="feedkey-clear"
          onClick={() => {
            setKey("");
            setProxy("");
            onSave({ apiKey: "", feedProxy: "" });
          }}
        >
          Forget what's saved
        </button>
      )}
    </div>
  );
}
