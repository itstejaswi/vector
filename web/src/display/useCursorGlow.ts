import { useEffect } from "react";

/**
 * A soft glow that follows the cursor across the HUD panels.
 *
 * Deliberately not React state. Storing the pointer position in state would
 * re-render the whole tree on every mouse move and stall the map; this writes
 * two CSS custom properties straight onto the hovered element and lets the
 * compositor paint the gradient.
 *
 * Only one element is ever updated - the panel under the cursor - and writes
 * are throttled to one per animation frame, so a fast sweep across the screen
 * costs a handful of style writes rather than hundreds.
 */

/** Elements that light up. The strip is excluded: it's a readout with
 *  pointer-events: none, so it can never be hovered. */
const SELECTOR = ".panel, .sheet, .loc-field, .loc-panel, .hud-brand, .hud-zoom";

export function useCursorGlow(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    // Touch devices have no cursor to follow, and anyone who has asked for
    // reduced motion should not get a moving light.
    if (!matchMedia("(pointer: fine)").matches) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;
    let lit: HTMLElement | null = null;

    const paint = () => {
      frame = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      pending = null;
      if (lit && lit !== el) lit.classList.remove("glow");
      el.style.setProperty("--gx", `${x}px`);
      el.style.setProperty("--gy", `${y}px`);
      el.classList.add("glow");
      lit = el;
    };

    const onMove = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (!target) {
        if (lit) {
          lit.classList.remove("glow");
          lit = null;
        }
        pending = null;
        return;
      }
      const box = target.getBoundingClientRect();
      pending = { el: target, x: e.clientX - box.left, y: e.clientY - box.top };
      // Coalesce to one write per frame however fast the pointer moves.
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onLeave = () => {
      if (lit) {
        lit.classList.remove("glow");
        lit = null;
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
      if (lit) lit.classList.remove("glow");
    };
  }, [enabled]);
}
