import { useCallback, useRef } from "react";

const MOVE_THRESHOLD = 10;

interface UseLongPressOptions {
  delay?: number;
}

/**
 * Long-press hook for touch devices. Returns touch event handlers and a
 * `firedRef` so callers can suppress click events that follow a long press.
 *
 * Usage:
 *   const { handlers, firedRef } = useLongPress(() => inspect(id));
 *   <div {...handlers} onClick={() => { if (!firedRef.current) handleClick(); }} />
 */
export function useLongPress(
  callback: () => void,
  options?: UseLongPressOptions,
) {
  const { delay = 500 } = options ?? {};
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      firedRef.current = false;
      const touch = e.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        callback();
      }, delay);
    },
    [callback, delay],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPos.current || !timerRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startPos.current.x;
      const dy = touch.clientY - startPos.current.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
        clear();
      }
    },
    [clear],
  );

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  const onTouchCancel = useCallback(() => {
    clear();
  }, [clear]);

  // Prevent the native context menu on long press (iOS/Android) but allow desktop right-click
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // Only suppress context menu triggered by touch (long-press), not mouse right-click
    if (timerRef.current || firedRef.current) {
      e.preventDefault();
    }
  }, []);

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onContextMenu },
    firedRef,
  };
}
