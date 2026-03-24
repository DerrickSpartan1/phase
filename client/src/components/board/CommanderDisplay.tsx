import { useMemo } from "react";

import type { GameObject, PlayerId } from "../../adapter/types.ts";
import { useGameStore } from "../../stores/gameStore.ts";

interface CommanderDisplayProps {
  playerId: PlayerId;
  compact?: boolean;
}

export function CommanderDisplay({ playerId, compact = false }: CommanderDisplayProps) {
  const gameState = useGameStore((s) => s.gameState);

  const commanders = useMemo(() => {
    if (!gameState) return [];

    const allObjects = Object.values(gameState.objects);
    return allObjects.filter(
      (obj) => obj.owner === playerId && obj.is_commander === true,
    );
  }, [gameState, playerId]);

  if (commanders.length === 0) return null;

  const sizeClass = compact ? "w-8 h-8 text-[9px]" : "w-12 h-12 text-xs";

  return (
    <div className="flex flex-col gap-1" data-testid={`commander-display-${playerId}`}>
      {commanders.map((commander) => (
        <CommanderEntry
          key={commander.id}
          commander={commander}
          sizeClass={sizeClass}
          compact={compact}
        />
      ))}
    </div>
  );
}

function CommanderEntry({
  commander,
  sizeClass,
  compact,
}: {
  commander: GameObject;
  sizeClass: string;
  compact: boolean;
}) {
  const inCommandZone = commander.zone === "Command";
  const tax = commander.commander_tax ?? 0;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md bg-gray-800/90 p-1 ${compact ? "px-1" : "px-2"}`}
      title={commander.name}
    >
      <div
        className={`${sizeClass} flex items-center justify-center rounded ring-2 ring-amber-500/70 bg-gray-700 font-bold text-amber-200 shadow-[0_0_6px_rgba(245,158,11,0.3)]`}
      >
        {inCommandZone ? "CZ" : "Cmd"}
      </div>
      <div className="flex flex-col">
        <span className={`font-medium text-gray-200 ${compact ? "text-[10px]" : "text-xs"} max-w-[80px] truncate`}>
          {commander.name}
        </span>
        {tax > 0 && (
          <span className="text-[9px] text-amber-400">
            Tax: +{tax}
          </span>
        )}
      </div>
    </div>
  );
}
