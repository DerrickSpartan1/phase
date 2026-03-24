import { useEffect, useState } from "react";

import type { GameObject } from "../../adapter/types.ts";
import { useCardImage } from "../../hooks/useCardImage.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { useUiStore } from "../../stores/uiStore.ts";
import { computePTDisplay, formatCounterType, formatTypeLine, toRoman } from "../../viewmodel/cardProps.ts";
import {
  getKeywordDisplayText,
  isGrantedKeyword,
  sortKeywords,
} from "../../viewmodel/keywordProps.ts";

interface CardPreviewProps {
  cardName: string | null;
  faceIndex?: number;
  position?: { x: number; y: number };
}

export function CardPreview({
  cardName,
  faceIndex,
  position,
}: CardPreviewProps) {
  if (!cardName) return null;

  return (
    <CardPreviewInner
      cardName={cardName}
      faceIndex={faceIndex}
      position={position}
    />
  );
}

function CardPreviewInner({
  cardName,
  faceIndex,
  position,
}: {
  cardName: string;
  faceIndex?: number;
  position?: { x: number; y: number };
}) {
  const { src, isLoading } = useCardImage(cardName, {
    size: "normal",
    faceIndex,
  });
  const inspectedObjectId = useUiStore((s) => s.inspectedObjectId);
  const obj = useGameStore((s) =>
    inspectedObjectId != null ? s.gameState?.objects[inspectedObjectId] ?? null : null,
  );
  const classLevel = obj?.class_level;
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function handlePointerMove(event: MouseEvent) {
      setPointerPosition({ x: event.clientX, y: event.clientY });
    }

    window.addEventListener("mousemove", handlePointerMove);
    return () => window.removeEventListener("mousemove", handlePointerMove);
  }, []);

  const showInfoPanel = obj?.zone === "Battlefield";
  const infoPanelHeight = showInfoPanel ? 120 : 0;
  const previewWidth =
    typeof window === "undefined" ? 472 : Math.min(Math.max(window.innerWidth * 0.26, 220), 472);
  const previewHeight =
    (typeof window === "undefined"
      ? 661
      : Math.min(window.innerHeight * 0.8, previewWidth * (7 / 5))) + infoPanelHeight;
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const gap = 20;

  const style: React.CSSProperties = position
    ? {
        left: Math.min(position.x + 16, window.innerWidth - 488),
        top: Math.min(position.y - 200, window.innerHeight - 736),
      }
    : pointerPosition
      ? {
          left:
            pointerPosition.x > viewportWidth / 2
              ? Math.max(16, pointerPosition.x - previewWidth - gap)
              : Math.min(pointerPosition.x + gap, viewportWidth - previewWidth - 16),
          top: Math.min(
            Math.max(16, pointerPosition.y - previewHeight / 2),
            viewportHeight - previewHeight - 16,
          ),
        }
    : {
        right: "calc(env(safe-area-inset-right) + 1rem + var(--game-right-rail-offset, 0px))",
        top: "calc(env(safe-area-inset-top) + var(--game-top-overlay-offset, 0px) + 1rem)",
      };

  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={style}
    >
      {isLoading || !src ? (
        <div className="max-h-[80vh] max-w-[42vw] w-[clamp(220px,26vw,472px)] aspect-[5/7] rounded-xl border border-gray-600 bg-gray-700 shadow-2xl animate-pulse md:max-w-[45vw]" />
      ) : (
        <div>
          <div className="relative">
            <img
              src={src}
              alt={cardName}
              className={`max-h-[80vh] max-w-[42vw] w-[clamp(220px,26vw,472px)] border border-gray-600 object-cover shadow-2xl md:max-w-[45vw] ${showInfoPanel ? "rounded-t-xl" : "rounded-xl"}`}
              draggable={false}
            />
            {classLevel != null && (
              <div className="absolute bottom-3 left-3 z-10">
                <div className="rounded-t-[4px] rounded-b-none bg-gradient-to-b from-amber-950 to-stone-900 px-3 pt-1.5 pb-2 border border-amber-800/60 shadow-lg clip-bookmark">
                  <span className="font-serif text-base font-bold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {toRoman(classLevel)}
                  </span>
                </div>
              </div>
            )}
          </div>
          {showInfoPanel && obj && <CardInfoPanel obj={obj} />}
        </div>
      )}
    </div>
  );
}

function CardInfoPanel({ obj }: { obj: GameObject }) {
  const ptDisplay = computePTDisplay(obj);
  const counters = Object.entries(obj.counters).filter(([type]) => type !== "Loyalty");
  const keywords = sortKeywords(obj.keywords);
  const colorsChanged =
    obj.color.length !== obj.base_color.length ||
    obj.color.some((c, i) => c !== obj.base_color[i]);

  return (
    <div className="w-full rounded-b-xl border border-t-0 border-gray-600 bg-gray-900/95 px-3 py-2 text-xs text-gray-200">
      {/* Type line */}
      <div className="truncate font-semibold text-gray-300">
        {formatTypeLine(obj.card_types)}
      </div>

      {/* Keywords */}
      {keywords.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
          {keywords.map((kw, i) => (
            <span
              key={i}
              className={isGrantedKeyword(kw, obj.base_keywords) ? "text-indigo-300" : "text-white"}
            >
              {getKeywordDisplayText(kw)}
            </span>
          ))}
        </div>
      )}

      {/* Counters */}
      {counters.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 text-gray-400">
          {counters.map(([type, count]) => (
            <span key={type}>
              {formatCounterType(type)}: {count}
            </span>
          ))}
        </div>
      )}

      {/* P/T breakdown */}
      {ptDisplay && (
        <div className="mt-1 text-gray-400">
          <span className={ptDisplay.powerColor === "green" ? "text-green-400" : ptDisplay.powerColor === "red" ? "text-red-400" : "text-white"}>
            {ptDisplay.power}
          </span>
          <span className="text-gray-500">/</span>
          <span className={ptDisplay.toughnessColor === "green" ? "text-green-400" : ptDisplay.toughnessColor === "red" ? "text-red-400" : "text-white"}>
            {ptDisplay.toughness}
          </span>
          {obj.base_power != null && obj.base_toughness != null && (
            <span className="ml-1 text-gray-500">(base {obj.base_power}/{obj.base_toughness})</span>
          )}
          {obj.damage_marked > 0 && (
            <span className="ml-2 text-red-400">Damage: {obj.damage_marked}</span>
          )}
        </div>
      )}

      {/* Color changes */}
      {colorsChanged && (
        <div className="mt-1 text-gray-400">
          Colors: {obj.color.length > 0 ? obj.color.join(", ") : "Colorless"}
        </div>
      )}
    </div>
  );
}
