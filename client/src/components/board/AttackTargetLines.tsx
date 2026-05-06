import { useMemo } from "react";
import { createPortal } from "react-dom";

import { usePreferencesStore } from "../../stores/preferencesStore.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { usePlayerId } from "../../hooks/usePlayerId.ts";
import {
  arcPath,
  useAttackerArrowPositions,
  type AttackerArrow,
} from "../../hooks/useAttackerArrowPositions.ts";

/** Red solid-arc arrows from attackers to their declared targets.
 *
 *  Unified across all target kinds — Player, Planeswalker, Battle — so the
 *  visual weight of a gang attack on your planeswalker reads the same as a
 *  gang attack on your life total. `isAtMe` thickens the stroke and enables
 *  the glow filter so the local defender's view stays dominant over arrows
 *  between other opponents.
 *
 *  Player-target arrows only draw in multiplayer (>2 players); in 1v1 the
 *  player attack is implicit and drawing would be visual noise. */
export function AttackTargetLines() {
  const combat = useGameStore((s) => s.gameState?.combat ?? null);
  const objects = useGameStore((s) => s.gameState?.objects);
  const seatOrder = useGameStore((s) => s.gameState?.seat_order);
  const vfxQuality = usePreferencesStore((s) => s.vfxQuality);
  const localPlayerId = usePlayerId();
  const isMinimal = vfxQuality === "minimal";

  const isMultiplayer = (seatOrder?.length ?? 0) > 2;

  const blockedAttackerIds = useMemo<Set<number>>(() => {
    if (!combat) return new Set();
    const ids = new Set<number>();
    for (const [attackerId, blockers] of Object.entries(combat.blocker_assignments)) {
      if (blockers.length > 0) ids.add(Number(attackerId));
    }
    return ids;
  }, [combat]);

  const arrows = useMemo<AttackerArrow[]>(() => {
    if (!combat) return [];
    const out: AttackerArrow[] = [];
    for (const attacker of combat.attackers) {
      const t = attacker.attack_target;
      switch (t.type) {
        case "Player": {
          if (!isMultiplayer) break;
          out.push({
            attackerId: attacker.object_id,
            target: { kind: "player", playerId: t.data },
            isAtMe: t.data === localPlayerId,
          });
          break;
        }
        case "Planeswalker":
        case "Battle": {
          // `isAtMe` for a permanent target is "do I control the thing being attacked?"
          const controller = objects?.[t.data]?.controller;
          out.push({
            attackerId: attacker.object_id,
            target: { kind: "object", objectId: t.data },
            isAtMe: controller === localPlayerId,
          });
          break;
        }
        default: {
          // Exhaustiveness check — a new AttackTarget variant must be
          // handled explicitly above. Fails typecheck if a variant is
          // added to the engine and this switch is not updated.
          const _exhaustive: never = t;
          return _exhaustive;
        }
      }
    }
    return out;
  }, [combat, isMultiplayer, localPlayerId, objects]);

  const positions = useAttackerArrowPositions(arrows);

  if (positions.length === 0) return null;

  return createPortal(
    <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full">
      <defs>
        {!isMinimal && (
          <filter id="attack-target-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
        <marker
          id="attack-arrow-head"
          markerWidth="6"
          markerHeight="5"
          refX="6"
          refY="2.5"
          orient="auto"
        >
          <path d="M0,0 L6,2.5 L0,5 Z" fill="rgba(220,38,38,0.95)" />
        </marker>
      </defs>

      {positions.map((arrow) => {
        const d = arcPath(arrow.from, arrow.to);
        const attackerId = Number(arrow.key.split("->")[0]);
        const isBlocked = blockedAttackerIds.has(attackerId);
        const dash = isBlocked ? "8 6" : undefined;
        return (
          <g key={arrow.key}>
            <path
              d={d}
              stroke="black"
              strokeWidth={isMinimal ? 3 : 5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={dash}
              markerEnd="url(#attack-arrow-head)"
            />
            <path
              d={d}
              stroke={arrow.isAtMe ? "rgba(220,38,38,0.95)" : "rgba(220,38,38,0.45)"}
              strokeWidth={arrow.isAtMe ? 2.5 : 2}
              fill="none"
              filter={isMinimal || !arrow.isAtMe ? undefined : "url(#attack-target-glow)"}
              strokeDasharray={dash}
              markerEnd="url(#attack-arrow-head)"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>,
    document.body,
  );
}
