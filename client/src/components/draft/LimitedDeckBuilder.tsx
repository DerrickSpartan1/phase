import { useMemo } from "react";

import { useCardImage } from "../../hooks/useCardImage";
import { useDraftStore } from "../../stores/draftStore";
import { menuButtonClass } from "../menu/buttonStyles";
import type { DraftCardInstance } from "../../adapter/draft-adapter";
import { ManaCurve } from "./ManaCurve";

// ── Constants ───────────────────────────────────────────────────────────

const BASIC_LANDS = [
  { name: "Plains", color: "W", colorClass: "bg-yellow-200" },
  { name: "Island", color: "U", colorClass: "bg-blue-400" },
  { name: "Swamp", color: "B", colorClass: "bg-slate-400" },
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
      className={`relative cursor-pointer overflow-hidden rounded-[14px] ring-1 ring-white/10 transition-all duration-150 hover:scale-[1.02] hover:ring-white/20
        ${dimmed ? "opacity-70 hover:opacity-90" : ""}`}
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
      {count !== undefined && count > 1 && (
        <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] font-bold text-white">
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
      <div className={`h-3 w-3 shrink-0 rounded-full ${colorClass}`} />
      <span className="flex-1 text-sm text-white/60">{name}</span>
      <button
        onClick={onDecrement}
        disabled={count <= 0}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-white/10 bg-black/18 text-sm font-bold text-white/60 transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-30"
      >
        -
      </button>
      <span className="w-6 text-center text-sm tabular-nums text-white">{count}</span>
      <button
        onClick={onIncrement}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-white/10 bg-black/18 text-sm font-bold text-white/60 transition-colors hover:bg-white/8"
      >
        +
      </button>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

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

function computeRemainingPool(
  pool: DraftCardInstance[],
  mainDeck: string[],
): DraftCardInstance[] {
  const deckCounts = new Map<string, number>();
  for (const name of mainDeck) {
    deckCounts.set(name, (deckCounts.get(name) ?? 0) + 1);
  }

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
    <div className="flex h-full gap-6">
      {/* Left column: Pool + Main Deck */}
      <div className="flex min-w-0 flex-[7] flex-col gap-6 overflow-y-auto">
        {/* Pool section */}
        <section>
          <h3 className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Pool ({remainingPool.length} available)
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
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
            <p className="py-4 text-sm text-white/30">All cards added to deck.</p>
          )}
        </section>

        {/* Main deck section */}
        <section>
          <h3 className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
            <span className="text-slate-500">Main Deck </span>
            <span className={mainDeck.length >= 23 ? "text-emerald-400" : "text-slate-500"}>
              ({mainDeck.length} spells)
            </span>
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
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
            <p className="py-4 text-sm text-white/30">
              Click cards from the pool to add them to your deck.
            </p>
          )}
        </section>
      </div>

      {/* Right column: Lands, Mana Curve, Actions */}
      <div className="flex min-w-[220px] flex-[3] flex-col gap-6">
        {/* Land counts */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Basic Lands
            </h3>
            <button
              onClick={autoSuggestLands}
              className="cursor-pointer text-xs text-cyan-400 transition-colors hover:text-cyan-300"
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
          <div className="mt-2 text-xs text-white/30">
            Total lands: {totalLands}
          </div>
        </section>

        {/* Mana curve */}
        <section>
          <ManaCurve cards={mainDeck} />
        </section>

        {/* Total count + actions */}
        <section className="flex flex-col gap-3">
          <div className={`text-center text-sm font-medium ${deckValid ? "text-emerald-400" : "text-red-400"}`}>
            {totalCards} / {MIN_DECK_SIZE} minimum
          </div>

          <button
            onClick={autoSuggestDeck}
            className={menuButtonClass({ tone: "neutral", size: "sm", className: "w-full" })}
          >
            Suggest Deck
          </button>

          <button
            onClick={submitDeck}
            disabled={!deckValid}
            className={menuButtonClass({
              tone: "amber",
              size: "md",
              disabled: !deckValid,
              className: "w-full",
            })}
          >
            Submit Deck
          </button>
        </section>
      </div>
    </div>
  );
}
