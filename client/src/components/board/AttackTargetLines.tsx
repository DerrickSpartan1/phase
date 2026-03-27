import { useMemo } from "react";
import { createPortal } from "react-dom";

import { usePreferencesStore } from "../../stores/preferencesStore.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { useRafPositions } from "../../hooks/useRafPositions.ts";
import type { ObjectId } from "../../adapter/types.ts";

/** Red arrow lines from attacking creatures to the planeswalker/battle they are attacking.
 *  Only shown for non-player attack targets — player attacks are the default and need no arrow. */
export function AttackTargetLines() {
  const combat = useGameStore((s) => s.gameState?.combat ?? null);
  const vfxQuality = usePreferencesStore((s) => s.vfxQuality);

  const pairs = useMemo(() => {
    const map = new Map<ObjectId, ObjectId>();
    if (!combat) return map;
    for (const attacker of combat.attackers) {
      if (attacker.attack_target.type !== "Player") {
        map.set(attacker.object_id, attacker.attack_target.data);
      }
    }
    return map;
  }, [combat]);

  const positions = useRafPositions(pairs);

  if (pairs.size === 0 || positions.size === 0) return null;

  const isMinimal = vfxQuality === "minimal";

  return createPortal(
    <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full">
      {!isMinimal && (
        <defs>
          <filter id="attack-target-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker
            id="attack-target-arrow"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L8,3 L0,6 Z" fill="rgba(220,38,38,0.8)" />
          </marker>
        </defs>
      )}
      {Array.from(positions.entries()).map(([attackerId, pos]) => (
        <line
          key={attackerId}
          x1={pos.from.x}
          y1={pos.from.y}
          x2={pos.to.x}
          y2={pos.to.y}
          stroke="rgba(220,38,38,0.7)"
          strokeWidth={isMinimal ? 1.5 : 2.5}
          strokeDasharray={isMinimal ? undefined : "8 4"}
          filter={isMinimal ? undefined : "url(#attack-target-glow)"}
          markerEnd={isMinimal ? undefined : "url(#attack-target-arrow)"}
        />
      ))}
    </svg>,
    document.body,
  );
}
