import { useMemo } from "react";

import { useCardImage } from "../../hooks/useCardImage";
import { useDraftStore } from "../../stores/draftStore";
import type { DraftCardInstance } from "../../adapter/draft-adapter";
import { ManaCurve } from "./ManaCurve";

// ── Constants ───────────────────────────────────────────────────────────

const BASIC_LANDS = [
  { name: "Plains", color: "W", colorClass: "bg-yellow-200" },
  { name: "Island", color: "U", colorClass: "bg-blue-400" },
  { name: "Swamp", color: "B", colorClass: "bg-gray-500" },
  { name: "Mountain", color: "R", colorClass: "bg-red-500" },
  { name: "Forest", color: "G", colorClass: "bg-green-500" },
] as const;

const MIN_DECK_SIZE = 40;

// ── Card image tile ─────────────────────────────────────────────────────

interface CardTileProps {
  card: DraftCardInstance;
  count?: number;
  dimmed?: boolean;
  onClick: () => void;
}

function CardTile({ card, count, dimmed, onClick }: CardTileProps) {
  const { src, isLoading } = useCardImage(card.name, { size: "normal" });

  return (
    <button
      onClick={onClick}
      className={`relative rounded-lg overflow-hidden cursor-pointer transition-all duration-150
        ring-1 ring-gray-700 hover:ring-gray-500 hover:scale-[1.02]
        ${dimmed ? "opacity-70 hover:opacity-90" : ""}`}
    >
      {isLoading || !src ? (
        <div className="aspect-[488/680] bg-gray-700 animate-pulse flex items-center justify-center">
          <span className="text-xs text-gray-400 px-2 text-center">{card.name}</span>
        </div>
      ) : (
        <img
          src={src}
          alt={card.name}
          draggable={false}
          className="w-full aspect-[488/680] object-cover"
        />
      )}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
        <span className="text-[10px] text-gray-200 leading-tight line-clamp-1">
          {card.name}
        </span>
      </div>
      {count !== undefined && count > 1 && (
        <div className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {count}
        </div>
      )}
    </button>
  );
}

// ── Land row ────────────────────────────────────────────────────────────

interface LandRowProps {
  name: string;
  colorClass: string;
  count: number;
  onDecrement: () => void;
  onIncrement: () => void;
}

function LandRow({ name, colorClass, count, onDecrement, onIncrement }: LandRowProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${colorClass} shrink-0`} />
      <span className="text-sm text-gray-300 flex-1">{name}</span>
      <button
        onClick={onDecrement}
        disabled={count <= 0}
        className="h-8 w-8 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold cursor-pointer"
      >
        -
      </button>
      <span className="text-sm text-white w-6 text-center tabular-nums">{count}</span>
      <button
        onClick={onIncrement}
        className="h-8 w-8 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm font-bold cursor-pointer"
      >
        +
      </button>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Group cards by name, returning one representative DraftCardInstance per unique name + count. */
function groupByName(
  cards: DraftCardInstance[],
  nameList: string[],
): { card: DraftCardInstance; count: number }[] {
  const countMap = new Map<string, number>();
  for (const name of nameList) {
    countMap.set(name, (countMap.get(name) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const groups: { card: DraftCardInstance; count: number }[] = [];
  for (const card of cards) {
    if (!seen.has(card.name) && countMap.has(card.name)) {
      seen.add(card.name);
      groups.push({ card, count: countMap.get(card.name)! });
    }
  }

  return groups;
}

/** Compute remaining pool: subtract mainDeck copies from pool. */
function computeRemainingPool(
  pool: DraftCardInstance[],
  mainDeck: string[],
): DraftCardInstance[] {
  // Count how many of each name are in the deck
  const deckCounts = new Map<string, number>();
  for (const name of mainDeck) {
    deckCounts.set(name, (deckCounts.get(name) ?? 0) + 1);
  }

  // Walk pool, skipping cards that are already in the deck
  const remaining: DraftCardInstance[] = [];
  const used = new Map<string, number>();
  for (const card of pool) {
    const usedCount = used.get(card.name) ?? 0;
    const deckCount = deckCounts.get(card.name) ?? 0;
    if (usedCount < deckCount) {
      used.set(card.name, usedCount + 1);
    } else {
      remaining.push(card);
    }
  }
  return remaining;
}

// ── Main component ──────────────────────────────────────────────────────

/** Purpose-built Limited deck builder for the draft flow. Per D-10. */
export function LimitedDeckBuilder() {
  const view = useDraftStore((s) => s.view);
  const mainDeck = useDraftStore((s) => s.mainDeck);
  const landCounts = useDraftStore((s) => s.landCounts);
  const addToDeck = useDraftStore((s) => s.addToDeck);
  const removeFromDeck = useDraftStore((s) => s.removeFromDeck);
  const setLandCount = useDraftStore((s) => s.setLandCount);
  const autoSuggestDeck = useDraftStore((s) => s.autoSuggestDeck);
  const autoSuggestLands = useDraftStore((s) => s.autoSuggestLands);
  const submitDeck = useDraftStore((s) => s.submitDeck);

  const pool = useMemo(() => view?.pool ?? [], [view?.pool]);

  const remainingPool = useMemo(
    () => computeRemainingPool(pool, mainDeck),
    [pool, mainDeck],
  );

  const deckGroups = useMemo(
    () => groupByName(pool, mainDeck),
    [pool, mainDeck],
  );

  const totalLands = useMemo(
    () => Object.values(landCounts).reduce((sum, n) => sum + n, 0),
    [landCounts],
  );

  const totalCards = mainDeck.length + totalLands;
  const deckValid = totalCards >= MIN_DECK_SIZE;

  if (!view) return null;

  return (
    <div className="flex gap-6 h-full">
      {/* Left column: Pool + Main Deck */}
      <div className="flex-[7] flex flex-col gap-6 min-w-0 overflow-y-auto">
        {/* Pool section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Pool ({remainingPool.length} available)
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {remainingPool.map((card) => (
              <CardTile
                key={card.instance_id}
                card={card}
                dimmed
                onClick={() => addToDeck(card.name)}
              />
            ))}
          </div>
          {remainingPool.length === 0 && (
            <p className="text-gray-500 text-sm py-4">All cards added to deck.</p>
          )}
        </section>

        {/* Main deck section */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">
            <span className="text-gray-400">Main Deck </span>
            <span className={mainDeck.length >= 23 ? "text-green-400" : "text-gray-400"}>
              ({mainDeck.length} spells)
            </span>
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {deckGroups.map(({ card, count }) => (
              <CardTile
                key={card.instance_id}
                card={card}
                count={count}
                onClick={() => removeFromDeck(card.name)}
              />
            ))}
          </div>
          {mainDeck.length === 0 && (
            <p className="text-gray-500 text-sm py-4">
              Click cards from the pool to add them to your deck.
            </p>
          )}
        </section>
      </div>

      {/* Right column: Lands, Mana Curve, Actions */}
      <div className="flex-[3] flex flex-col gap-6 min-w-[220px]">
        {/* Land counts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Basic Lands
            </h3>
            <button
              onClick={autoSuggestLands}
              className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              Auto Lands
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {BASIC_LANDS.map(({ name, colorClass }) => (
              <LandRow
                key={name}
                name={name}
                colorClass={colorClass}
                count={landCounts[name] ?? 0}
                onDecrement={() => setLandCount(name, (landCounts[name] ?? 0) - 1)}
                onIncrement={() => setLandCount(name, (landCounts[name] ?? 0) + 1)}
              />
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Total lands: {totalLands}
          </div>
        </section>

        {/* Mana curve */}
        <section>
          <ManaCurve cards={mainDeck} />
        </section>

        {/* Total count + actions */}
        <section className="flex flex-col gap-3">
          <div className={`text-sm font-medium text-center ${deckValid ? "text-green-400" : "text-red-400"}`}>
            {totalCards} / {MIN_DECK_SIZE} minimum
          </div>

          <button
            onClick={autoSuggestDeck}
            className="w-full px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 font-medium text-sm cursor-pointer transition-colors"
          >
            Suggest Deck
          </button>

          <button
            onClick={submitDeck}
            disabled={!deckValid}
            className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              deckValid
                ? "bg-amber-500 hover:bg-amber-400 text-black cursor-pointer"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            Submit Deck
          </button>
        </section>
      </div>
    </div>
  );
}
