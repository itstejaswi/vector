/**
 * Inline SVG icons.
 *
 * These replace the typed symbol characters the HUD used to use (✈ ◎ ◷ ▲ ◈ …).
 * Almost none of those glyphs exist in SF Pro or Segoe UI, so each one fell
 * through to a different fallback font and rendered at a different size: at an
 * identical font-size: 11px, ✈ came out 14.7px tall while ▮ and ◈ came out
 * 16px, with widths varying too. No amount of font-size tuning fixes that,
 * because the metrics belong to the fallback font, not to us.
 *
 * An SVG occupies exactly the box we give it on every platform, so icons line
 * up with their labels and scale with one number.
 */

export type IconName =
  | "plane"
  | "planeRight"
  | "target"
  | "clock"
  | "altitude"
  | "speed"
  | "status"
  | "traffic"
  | "stats"
  | "locate"
  | "close"
  | "chevron"
  | "heart"
  | "departure"
  | "arrival"
  | "cruising";

interface Props {
  name: IconName;
  /** Edge length of the square box, in px. */
  size?: number;
  className?: string;
  /** Rotation in degrees, applied about the centre. */
  rotate?: number;
}

/**
 * Paths are authored in a 16x16 box and drawn with currentColor, so an icon
 * inherits the colour of whatever text it sits beside.
 */
const PATHS: Record<IconName, JSX.Element> = {
  // Nose up.
  plane: (
    <path
      d="M8 1.4c.62 0 1.05.72 1.05 1.9v2.98l4.7 2.72v1.42l-4.7-1.42v3.04l1.55 1.1v1.1L8 13.7l-2.6.54v-1.1l1.55-1.1V9l-4.7 1.42V9L6.95 6.28V3.3c0-1.18.43-1.9 1.05-1.9z"
      fill="currentColor"
    />
  ),
  // Nose right, for route strips that read left to right.
  planeRight: (
    <path
      d="M14.6 8c0 .62-.72 1.05-1.9 1.05h-2.98l-2.72 4.7H5.58l1.42-4.7H3.96l-1.1 1.55h-1.1L2.3 8l-.54-2.6h1.1l1.1 1.55H7L5.58 2.25H7l2.72 4.7h2.98c1.18 0 1.9.43 1.9 1.05z"
      fill="currentColor"
    />
  ),
  target: (
    <>
      <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.9" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.9" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 4.5V8l2.5 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  altitude: (
    <path
      d="M8 2.6l4.4 6.2H9.3v4.6H6.7V8.8H3.6z"
      fill="currentColor"
    />
  ),
  speed: (
    <path
      d="M3.4 3.6L7.9 8l-4.5 4.4M8.6 3.6L13.1 8l-4.5 4.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  status: (
    <path d="M8 1.6L14.4 8 8 14.4 1.6 8z" fill="currentColor" />
  ),
  traffic: (
    <>
      <rect x="2" y="3.2" width="12" height="1.9" rx="0.95" fill="currentColor" />
      <rect x="2" y="7.05" width="12" height="1.9" rx="0.95" fill="currentColor" />
      <rect x="2" y="10.9" width="12" height="1.9" rx="0.95" fill="currentColor" />
    </>
  ),
  /*
   * Telemetry: a radar scope with its sweep. The bar chart this replaced read
   * as phone signal strength rather than anything to do with aviation.
   *
   * Deliberately just a ring, a wedge and a pip. This renders at 12px in a
   * panel header, and the obvious idea - a small aircraft sitting inside the
   * scope - was tried and rejected: at that size the aircraft and the rings
   * merge into an illegible smudge. A scope alone survives; a scope with
   * detail inside it does not.
   */
  stats: (
    <>
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {/* The sweep, caught mid-rotation. */}
      <path d="M8 8 L8 1.6 A6.4 6.4 0 0 1 12.5 3.5 Z" fill="currentColor" fillOpacity="0.9" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" />
    </>
  ),
  locate: (
    <>
      <circle cx="8" cy="8" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1v2.2M8 12.8V15M15 8h-2.2M3.2 8H1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  close: (
    <path
      d="M4 4l8 8M12 4l-8 8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  ),
  // Points up; rotate 180 for down.
  chevron: (
    <path
      d="M3.4 10.2L8 5.6l4.6 4.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  heart: (
    <path
      d="M8 14.1l-1-.9C3.3 9.9 1.4 8.2 1.4 5.9c0-1.9 1.5-3.4 3.4-3.4 1.1 0 2.1.5 2.7 1.3l.5.7.5-.7c.6-.8 1.6-1.3 2.7-1.3 1.9 0 3.4 1.5 3.4 3.4 0 2.3-1.9 4-5.6 7.3z"
      fill="currentColor"
    />
  ),

  /*
   * Flight phase, from Tabler Icons (MIT) — the same set the brand mark comes
   * from, so they sit together naturally. Drawn on Tabler's 24 grid and scaled
   * onto this 16 one; the 2 stroke lands at ~1.33 after scaling, which matches
   * the weight of the hand-drawn icons beside them.
   */
  departure: (
    <g
      transform="scale(0.667)"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.639 10.258l4.83 -1.294a2 2 0 1 1 1.035 3.863l-14.489 3.883l-4.45 -5.02l2.897 -.776l2.45 1.414l2.897 -.776l-3.743 -6.244l2.898 -.777l5.675 5.727" />
      <path d="M3 21h18" />
    </g>
  ),
  arrival: (
    <g
      transform="scale(0.667)"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.157 11.81l4.83 1.295a2 2 0 1 1 -1.036 3.863l-14.489 -3.882l-1.345 -6.572l2.898 .776l1.414 2.45l2.898 .776l-.12 -7.279l2.898 .777l2.052 7.797" />
      <path d="M3 21h18" />
    </g>
  ),
  cruising: (
    <g
      transform="scale(0.667)"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 11.085h5a2 2 0 1 1 0 4h-15l-3 -6h3l2 2h3l-2 -7h3l4 7" />
      <path d="M3 21h18" />
    </g>
  ),
};

export function Icon({ name, size = 14, className, rotate }: Props) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      focusable="false"
      aria-hidden="true"
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * The Vector brand mark: a departing airliner over a runway.
 *
 * The artwork is the "plane-departure" icon from Tabler Icons, used under the
 * MIT licence and recoloured; the README credits it alongside the other
 * upstream sources.
 *
 * This must match public/favicon.svg so the browser tab and the app show the
 * same mark. Geometry is the favicon's, halved onto this 16x16 grid: scale
 * 1.12 becomes 0.56 and the inset halves. The stroke stays at 1.5 because it
 * sits inside the scaled group in both files, so it scales with them.
 *
 * Kept out of the icon table because it's stroked rather than filled and
 * carries its own transform.
 */
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      focusable="false"
      aria-hidden="true"
    >
      <g
        transform="translate(1.25 1.5) scale(0.56)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.639 10.258l4.83 -1.294a2 2 0 1 1 1.035 3.863l-14.489 3.883l-4.45 -5.02l2.897 -.776l2.45 1.414l2.897 -.776l-3.743 -6.244l2.898 -.777l5.675 5.727" />
        <path d="M3 21h18" />
      </g>
    </svg>
  );
}
