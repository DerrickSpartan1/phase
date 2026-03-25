import { useCallback } from "react";

import { useLongPress } from "./useLongPress.ts";
import { useUiStore } from "../stores/uiStore.ts";

/**
 * Combined mouse hover + touch long-press handlers for card preview.
 *
 * Spread `handlers` onto the card element and use `firedRef` to suppress
 * click events that follow a long press.
 *
 * Usage:
 *   const { handlers, firedRef } = useCardHover(objectId);
 *   <div {...handlers} onClick={() => { if (!firedRef.current) doClick(); }} />
 */
export function useCardHover(objectId: number | null) {
  const inspectObject = useUiStore((s) => s.inspectObject);
  const setPreviewSticky = useUiStore((s) => s.setPreviewSticky);

  const { handlers: longPressHandlers, firedRef } = useLongPress(
    useCallback(() => {
      if (objectId != null) {
        inspectObject(objectId);
        setPreviewSticky(true);
      }
    }, [inspectObject, setPreviewSticky, objectId]),
  );

  const onMouseEnter = useCallback(() => {
    if (objectId != null) inspectObject(objectId);
  }, [inspectObject, objectId]);

  const onMouseLeave = useCallback(() => {
    inspectObject(null);
  }, [inspectObject]);

  return {
    handlers: {
      onMouseEnter,
      onMouseLeave,
      ...longPressHandlers,
    },
    firedRef,
  };
}
