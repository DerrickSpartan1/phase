import { useEffect } from "react";

import { useCardImage } from "../../hooks/useCardImage";
import { useDraftStore } from "../../stores/draftStore";
import { menuButtonClass } from "../menu/buttonStyles";
import type { DraftCardInstance } from "../../adapter/draft-adapter";

// ── Card tile ───────────────────────────────────────────────────────────

interface PackCardProps {
  card: DraftCardInstance;
  isSelected: boolean;
  onSelect: (instanceId: string) => void;
  onHover: (name: string | null) => void;
}

function PackCard({ card, isSelected, onSelect, onHover }: PackCardProps) {
  const { src, isLoading } = useCardImage(card.name, { size: "normal" });

  return (
    <button
      onClick={() => onSelect(card.instance_id)}
      onMouseEnter={() => onHover(card.name)}
      onMouseLeave={() => onHover(null)}
      className={`relative cursor-pointer overflow-hidden rounded-[14px] transition-all duration-150 ${
        isSelected
          ? "z-10 scale-105 ring-2 ring-amber-400 shadow-lg shadow-amber-400/20"
          : "ring-1 ring-white/10 hover:scale-[1.02] hover:ring-white/20"
      }`}
    >
      {isLoading || !src ? (
        <div className="flex aspect-[488/680] animate-pulse items-center justify-center bg-white/5">
          <span className="px-2 text-center text-xs text-white/40">{card.name}</span>
        </div>
      ) : (
        <img
          src={src}
          alt={card.name}
          draggable={false}
          className="aspect-[488/680] w-full object-cover"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
        <span className="line-clamp-1 text-[10px] leading-tight text-white/80">
          {card.name}
        </span>
      </div>
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────────

interface PackDisplayProps {
  onCardHover: (name: string | null) => void;
}

export function PackDisplay({ onCardHover }: PackDisplayProps) {
  const view = useDraftStore((s) => s.view);
  const selectedCard = useDraftStore((s) => s.selectedCard);
  const selectCard = useDraftStore((s) => s.selectCard);
  const confirmPick = useDraftStore((s) => s.confirmPick);

  useEffect(() => {
    if (view?.current_pack?.length === 1 && !selectedCard) {
      selectCard(view.current_pack[0].instance_id);
    }
  }, [view?.current_pack, selectedCard, selectCard]);

  if (!view) return null;

  const pack = view.current_pack;

  if (!pack || pack.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-white/40">
        Waiting for next pack...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {pack.map((card) => (
          <PackCard
            key={card.instance_id}
            card={card}
            isSelected={selectedCard === card.instance_id}
            onSelect={selectCard}
            onHover={onCardHover}
          />
        ))}
      </div>

      <div className="flex justify-center">
        <button
          onClick={confirmPick}
          disabled={!selectedCard}
          className={menuButtonClass({
            tone: "amber",
            size: "md",
            disabled: !selectedCard,
          })}
        >
          Confirm Pick
        </button>
      </div>
    </div>
  );
}
