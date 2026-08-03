import { useEffect, useRef, useState } from "react";

/**
 * A split-flap airport board, for the departure and arrival codes.
 *
 * Each character is its own flap. When the code changes, every flap riffles
 * through the alphabet until it lands on its target letter, staggered so the
 * word resolves left to right the way a real board does.
 *
 * The animation runs on a single interval that ticks every flap at once, not
 * one timer per character, and it stops dead the moment every flap has landed.
 * A three-letter code settles in well under a second.
 */

/**
 * The flap deck.
 *
 * Letters and digits only in the spinning part, with punctuation parked past
 * the end. A real board's flaps carry the alphabet; riffling through commas
 * and degree signs looks like corruption rather than mechanism. Anything in
 * the tail is reachable as a resting face but is never spun through, because
 * the riffle starts a fixed distance back inside SPIN_LEN.
 */
const DECK = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -,./:°'";

/** How much of the deck the riffle cycles through. */
const SPIN_LEN = 37;

/** How long each flap rests on a face before turning, in milliseconds. */
const TICK_MS = 45;

/** Extra flaps each successive character turns, so the word resolves L to R. */
const STAGGER = 4;

/** Ceiling on how far any flap travels, so a change never drags on. */
const MAX_SPIN = 14;

/**
 * A change touching this many characters or fewer skips the riffle.
 *
 * Live telemetry ticks constantly - a descending aircraft's altitude changes
 * every poll - and spinning the whole readout for "23,071" to "23,075" is
 * exhausting to sit next to. A board only makes sense when the whole value
 * turns over, which is what happens when a different flight is selected.
 */
const RIFFLE_THRESHOLD = 2;

function faceIndex(ch: string): number {
  const i = DECK.indexOf(ch.toUpperCase());
  // Anything off-deck rests on the blank rather than throwing the index off.
  return i === -1 ? DECK.indexOf(" ") : i;
}

interface Props {
  /** The text to display. Characters outside the deck settle as blanks. */
  value: string;
  /**
   * Pad to this many characters so the board keeps a fixed width. Omit to
   * size to the value, which suits variable-length readouts like "1,775 ft".
   */
  width?: number;
  /** Right-align the padding, for numbers that should sit flush right. */
  alignRight?: boolean;
  className?: string;
}

export function SplitFlap({ value, width, alignRight, className }: Props) {
  const raw = value.toUpperCase();
  const target =
    width == null
      ? raw
      : alignRight
        ? raw.padStart(width, " ").slice(-width)
        : raw.padEnd(width, " ").slice(0, width);

  // What each flap is currently showing, as a deck index.
  const [faces, setFaces] = useState<number[]>(() =>
    [...target].map((c) => faceIndex(c)),
  );
  const facesRef = useRef(faces);
  facesRef.current = faces;

  useEffect(() => {
    const goal = [...target].map((c) => faceIndex(c));
    const current = facesRef.current;

    // Nothing to do if the board already reads correctly.
    if (current.length === goal.length && current.every((f, i) => f === goal[i])) {
      return;
    }

    // Anyone who has asked for reduced motion gets the answer, not the show.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFaces(goal);
      return;
    }

    // A small edit - a ticking altitude, a counting-down ETA - just updates.
    if (current.length === goal.length) {
      const changed = goal.reduce((n, g, i) => (g === current[i] ? n : n + 1), 0);
      if (changed <= RIFFLE_THRESHOLD) {
        setFaces(goal);
        return;
      }
    }
    /*
     * Each flap starts a fixed distance back from its target rather than from
     * wherever it happened to be. That keeps the riffle even across the word:
     * starting from the previous letter would make some flaps travel one step
     * and others thirty.
     *
     * Both the start point and the step wrap within SPIN_LEN, so a flap only
     * ever cycles through letters, digits and the blank. Punctuation sits past
     * that boundary: reachable as a target, never spun through.
     */
    let live = goal.map((g, i) => {
      // A punctuation target has no run-up; it simply appears.
      if (g >= SPIN_LEN) return g;
      const spin = MAX_SPIN + i * STAGGER;
      return (g - spin + SPIN_LEN * 4) % SPIN_LEN;
    });
    setFaces(live);

    /*
     * The running state is held here rather than read back out of setFaces.
     * A functional update runs asynchronously, so testing for "settled" inside
     * it and clearing the timer outside would read a stale value and leave the
     * interval running forever.
     */
    const timer = setInterval(() => {
      live = live.map((f, i) =>
        f === goal[i] ? f : (f + 1) % SPIN_LEN,
      );
      setFaces(live);
      if (live.every((f, i) => f === goal[i])) clearInterval(timer);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [target]);

  const shown = faces.map((f) => DECK[f]).join("");
  const settled = shown === target;

  /*
   * Once settled this is plain text, so the type keeps its real kerning. Only
   * the riffle needs fixed-width cells, and even then they sit inside a box
   * sized by an invisible copy of the final text: the block holds its place
   * while the characters churn, instead of jittering as glyph widths change.
   *
   * The alternative - fixed cells always - cannot look right with a
   * proportional face. Measured in this stack, W is 0.93em and I is 0.26em,
   * so any single cell width either clips the wide glyphs or strands the
   * narrow ones in space.
   */
  if (settled) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span className={className ? `flap ${className}` : "flap"} aria-label={value}>
      <span className="flap-sizer" aria-hidden="true">
        {value}
      </span>
      <span className="flap-run" aria-hidden="true">
        {shown.split("").map((ch, i) => (
          <span className="flap-cell" key={i}>
            {ch}
          </span>
        ))}
      </span>
    </span>
  );
}
