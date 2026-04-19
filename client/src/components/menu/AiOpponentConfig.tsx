import { useMemo } from "react";

import { useFeedDeckList } from "../../hooks/useFeedDeckList";
import type { FeedDeckMeta } from "../../hooks/useFeedDeckList";
import { AI_DIFFICULTIES, type AIDifficulty } from "../../constants/ai";
import {
  AI_DECK_RANDOM,
  usePreferencesStore,
  type AiArchetypeFilter,
  type AiDeckSelection,
} from "../../stores/preferencesStore";
import type { DeckArchetype } from "../../services/engineRuntime";

interface Props {
  format?: string;
}

const ARCHETYPE_OPTIONS: AiArchetypeFilter[] = [
  "Any",
  "Aggro",
  "Midrange",
  "Control",
  "Combo",
  "Ramp",
];

function archetypeAccent(a: DeckArchetype | null): string {
  switch (a) {
    case "Aggro":
      return "text-red-300";
    case "Control":
      return "text-sky-300";
    case "Midrange":
      return "text-emerald-300";
    case "Combo":
      return "text-fuchsia-300";
    case "Ramp":
      return "text-amber-300";
    default:
      return "text-slate-400";
  }
}

export function AiOpponentConfig({ format }: Props) {
  const difficulty = usePreferencesStore((s) => s.aiDifficulty);
  const setDifficulty = usePreferencesStore((s) => s.setAiDifficulty);
  const deckName = usePreferencesStore((s) => s.aiDeckName);
  const setDeckName = usePreferencesStore((s) => s.setAiDeckName);
  const archetypeFilter = usePreferencesStore((s) => s.aiArchetypeFilter);
  const setArchetypeFilter = usePreferencesStore((s) => s.setAiArchetypeFilter);
  const coverageFloor = usePreferencesStore((s) => s.aiCoverageFloor);
  const setCoverageFloor = usePreferencesStore((s) => s.setAiCoverageFloor);

  const { decks, meta, loading } = useFeedDeckList(format);

  // Archetype + coverage filter the Random *pool*; they are irrelevant when a
  // specific deck is chosen (that deck's archetype/coverage are fixed). The UI
  // reflects this by disabling the archetype dropdown when a deck is named.
  const isRandom = deckName === AI_DECK_RANDOM;
  const effectiveArchetype: AiArchetypeFilter = isRandom ? archetypeFilter : "Any";

  const filteredDecks = useMemo(() => {
    return decks.filter((d) => {
      const m: FeedDeckMeta | undefined = meta.get(d.name);
      if (m?.coveragePct != null && m.coveragePct < coverageFloor) return false;
      if (effectiveArchetype !== "Any" && m?.archetype && m.archetype !== effectiveArchetype) {
        return false;
      }
      return true;
    });
  }, [decks, meta, coverageFloor, effectiveArchetype]);

  // When deck is Random, scope the selector to the filtered pool.
  // When deck is named, offer the full deck list so the user can still switch.
  const deckOptions = isRandom ? filteredDecks : decks;
  const selectionValid = isRandom || deckOptions.some((d) => d.name === deckName);
  const effectiveSelection: AiDeckSelection = selectionValid ? deckName : AI_DECK_RANDOM;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-200">
          AI Opponent
        </span>
        {loading && <span className="text-[10px] text-slate-500">Analyzing decks…</span>}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Deck</span>
        <select
          value={effectiveSelection}
          onChange={(e) => setDeckName(e.target.value as AiDeckSelection)}
          className="rounded-lg border border-gray-700 bg-gray-800/60 px-2 py-1.5 text-sm text-white"
        >
          <option value={AI_DECK_RANDOM}>Random ({filteredDecks.length})</option>
          {deckOptions.map((d) => {
            const m = meta.get(d.name);
            const suffix = [m?.archetype, m?.coveragePct != null ? `${m.coveragePct}%` : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <option key={d.name} value={d.name}>
                {d.name}
                {suffix ? ` — ${suffix}` : ""}
              </option>
            );
          })}
        </select>
      </label>

      <label className={`flex flex-col gap-1 ${isRandom ? "" : "opacity-50"}`}>
        <span className="text-xs text-slate-400">
          Archetype {isRandom ? "" : <span className="text-[10px] italic">(random only)</span>}
        </span>
        <select
          value={archetypeFilter}
          onChange={(e) => setArchetypeFilter(e.target.value as AiArchetypeFilter)}
          disabled={!isRandom}
          className={`rounded-lg border border-gray-700 bg-gray-800/60 px-2 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${archetypeAccent(
            archetypeFilter === "Any" ? null : (archetypeFilter as DeckArchetype),
          )}`}
        >
          {ARCHETYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt} className="text-white">
              {opt}
            </option>
          ))}
        </select>
      </label>

      <label className={`flex flex-col gap-1 ${isRandom ? "" : "opacity-50"}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Card Coverage {isRandom ? "" : <span className="text-[10px] italic">(random only)</span>}
          </span>
          <span className="text-sm font-medium text-white">{coverageFloor}%</span>
        </div>
        <input
          type="range"
          min={50}
          max={100}
          step={5}
          value={coverageFloor}
          onChange={(e) => setCoverageFloor(Number(e.target.value))}
          disabled={!isRandom}
          className="w-full disabled:cursor-not-allowed"
        />
        <span className="text-[10px] text-slate-500">
          Exclude decks below this engine-support threshold
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Difficulty</span>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as AIDifficulty)}
          className="rounded-lg border border-gray-700 bg-gray-800/60 px-2 py-1.5 text-sm text-white"
        >
          {AI_DIFFICULTIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
