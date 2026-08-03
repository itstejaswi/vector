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

import { useId } from "react";

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
  | "heart";

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
  stats: (
    <>
      <rect x="2.2" y="9" width="2.8" height="4.8" rx="0.8" fill="currentColor" />
      <rect x="6.6" y="5.4" width="2.8" height="8.4" rx="0.8" fill="currentColor" />
      <rect x="11" y="2.2" width="2.8" height="11.6" rx="0.8" fill="currentColor" />
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
 * The Vector brand mark: an airliner banked 45 degrees and climbing away on
 * its contrail. Drawn from scratch — every path is plain geometry specified
 * by coordinate, nothing traced from or derived from any existing logo.
 *
 * Kept out of the icon table because it's two-tone (the trail fades) and
 * because it must match public/favicon.svg, so the browser tab and the app
 * show the same mark. Geometry is the favicon's, halved onto this 16x16 grid.
 */
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  // Gradient ids are document-global, so two instances would collide.
  const id = useId();
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        {/* The contrail dissipates towards its tail, which reads as motion.
            Both stops are currentColor, so the mark takes the colour of
            whatever it sits beside. */}
        <linearGradient
          id={id}
          x1="1.5"
          y1="14"
          x2="9"
          y2="7.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <path
        d="M1.4 14.3C5.1 13.1 7.4 11.1 8.9 8.4"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Fuselage, swept wings and tailplane, drawn nose-up then banked. */}
      <path
        transform="translate(10.2 5.9) rotate(45) scale(0.59)"
        d="M0 -7.6c.85 0 1.42 1.05 1.42 2.55v1.7l5.5 3.4v1.9l-5.5-1.75v3.3l2.1 1.55v1.5L0 6.6l-3.52 1.05v-1.5l2.1-1.55v-3.3l-5.5 1.75v-1.9l5.5-3.4v-1.7C-1.42-6.55-.85-7.6 0-7.6Z"
        fill="currentColor"
      />
    </svg>
  );
}
