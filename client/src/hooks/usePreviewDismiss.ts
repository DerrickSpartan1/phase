import { useEffect, useRef } from "react";

import { useUiStore } from "../stores/uiStore.ts";

/**
 * Safety mechanism to dismiss the card preview when the pointer is no longer
 * over an inspectable element. This handles the case where framer-motion
 * animations (tap rotation, attack slide, layout transitions) move elements
 * out from under the cursor without firing onMouseLeave.
 *
 * Uses `document.elementFromPoint()` on a 300ms interval to verify the pointer
 * is still over an element with `[data-card-hover]`.
 */
export function usePreviewDismiss() {
  const inspectedObjectId = useUiStore((s) => s.inspectedObjectId);
  const inspectObject = useUiStore((s) => s.inspectObject);
  const hoverObject = useUiStore((s) => s.hoverObject);
  const pointerRef = useRef({ x: 0, y: 0 });

  // Track pointer position (only while preview is active)
  useEffect(() => {
    if (inspectedObjectId == null) return;

    function onMove(e: PointerEvent) {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    }

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, [inspectedObjectId]);

  // Periodically verify the pointer is still over a card-hover element
  useEffect(() => {
    if (inspectedObjectId == null) return;

    // Grace period: skip the first check to avoid dismissing immediately
    // when the inspection was just set (e.g., via click rather than hover)
    let skipFirst = true;

    const id = setInterval(() => {
      if (skipFirst) {
        skipFirst = false;
        return;
      }
      const { x, y } = pointerRef.current;
      // If pointer is at 0,0 it hasn't moved yet — don't dismiss
      if (x === 0 && y === 0) return;

      const el = document.elementFromPoint(x, y);
      if (!el) return;

      const isOverCard = el.closest("[data-card-hover]") !== null;
      if (!isOverCard) {
        inspectObject(null);
        hoverObject(null);
      }
    }, 300);

    return () => clearInterval(id);
  }, [inspectedObjectId, inspectObject, hoverObject]);
}
