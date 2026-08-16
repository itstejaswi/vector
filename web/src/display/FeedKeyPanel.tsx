import { useEffect, useState } from "react";
import { Icon } from "./Icon.js";

interface Props {
  apiKey: string;
  onSave: (key: string) => void;
}

/**
 * Feed key panel.
 *
 * Shown only when the position feed is failing, because until August 2026 it
 * never needed to exist: airplanes.live answered browsers without a key and
 * the app had nothing to configure. Then every free ADS-B network closed
 * browser access at once, and the only one still answering wants a key.
 *
 * It is deliberately not a permanent settings pane. Nobody opens a flight
 * tracker wanting to think about API credentials, so the panel appears when
 * there is a problem it can solve, explains what happened, and goes away once
 * aircraft are on screen.
 */
export function FeedKeyPanel({ apiKey, onSave }: Props) {
  const [value, setValue] = useState(apiKey);
  const [open, setOpen] = useState(false);

  // Reflect a key set elsewhere (another tab, a reset) without clobbering
  // whatever is being typed here.
  useEffect(() => {
    if (!open) setValue(apiKey);
  }, [apiKey, open]);

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
        <span>Fix the feed</span>
      </button>
    );
  }

  return (
    <div className="feedkey">
      <div className="feedkey-head">
        <strong>The feed needs a key</strong>
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
        ADS-B network closed browser access at about the same time. Nothing
        here can work around it: only the API's owner can allow a browser to
        call it.
      </p>
      <p className="feedkey-body">
        AirLabs still does.{" "}
        <a href="https://airlabs.co" target="_blank" rel="noreferrer">
          Take a free key
        </a>{" "}
        and paste it below. It stays in this browser and is sent only to
        AirLabs.
      </p>

      <div className="feedkey-row">
        <input
          type="password"
          className="feedkey-input"
          value={value}
          placeholder="AirLabs API key"
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

      {apiKey && (
        <button
          type="button"
          className="feedkey-clear"
          onClick={() => {
            setValue("");
            onSave("");
          }}
        >
          Remove the saved key
        </button>
      )}
    </div>
  );
}
