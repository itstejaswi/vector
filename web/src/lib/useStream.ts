import { useEffect, useState } from "react";
import { SkyFeed, type StreamState } from "./skyfeed.js";

/**
 * One feed per page, shared by every component that asks for it. The old
 * WebSocket version created a connection per caller, which meant the display
 * and its config tuner each opened their own socket and raced each other.
 */
let feed: SkyFeed | null = null;
let refCount = 0;

function acquire(): SkyFeed {
  if (!feed) {
    feed = new SkyFeed();
    feed.connect();
  }
  refCount++;
  return feed;
}

function release(): void {
  refCount--;
  if (refCount <= 0 && feed) {
    feed.close();
    feed = null;
    refCount = 0;
  }
}

export function useStream(): { state: StreamState; conn: SkyFeed } {
  const [conn] = useState(acquire);
  const [state, setState] = useState<StreamState>(conn.state);

  useEffect(() => {
    const unsub = conn.subscribe(setState);
    return () => {
      unsub();
      release();
    };
  }, [conn]);

  return { state, conn };
}
