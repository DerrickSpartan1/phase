import { useEffect, useState } from "react";

import type { GameFormat, MatchType } from "../adapter/types";
import {
  listSavedDeckNames,
  loadDeckOrigins,
  loadSavedDeck,
} from "../constants/storage";
import { loadPreconDeckMap } from "../hooks/useDecks";
import type { ParsedDeck } from "./deckParser";
import { evaluateDeckCompatibility } from "./deckCompatibility";
import { classifyDeck } from "./engineRuntime";
import type { DeckArchetype } from "./engineRuntime";
import {
  feedDeckToParsedDeck,
  getCachedFeed,
  listSubscriptions,
} from "./feedService";
import { preconDeckEntryToParsedDeck } from "./preconDecks";

export type AiDeckSource =
  | { type: "saved"; feedId?: string }
  | { type: "feed"; feedId: string }
  | { type: "precon"; deckId: string; code: string };

export interface AiDeckCandidate {
  id: string;
  name: string;
  source: AiDeckSource;
  deck: ParsedDeck;
  coveragePct: number | null;
  archetype: DeckArchetype | null;
}

export interface AiDeckCatalogOptions {
  selectedFormat?: GameFormat | null;
  selectedMatchType?: MatchType | null;
}

export interface AiDeckCatalogResult {
  candidates: AiDeckCandidate[];
}

export interface UseAiDeckCatalogResult extends AiDeckCatalogResult {
  loading: boolean;
  error: string | null;
}

function coveragePct(total: number, supported: number): number | null {
  if (total <= 0) return null;
  return Math.round((supported / total) * 100);
}

function expandedNames(deck: ParsedDeck): string[] {
  return deck.main.flatMap((entry) => Array.from({ length: entry.count }, () => entry.name));
}

async function classifyCandidate(deck: ParsedDeck): Promise<DeckArchetype | null> {
  try {
    return (await classifyDeck(expandedNames(deck))).archetype;
  } catch {
    return null;
  }
}

async function legalCandidate(
  candidate: Omit<AiDeckCandidate, "coveragePct" | "archetype">,
  options: AiDeckCatalogOptions,
): Promise<AiDeckCandidate | null> {
  const result = await evaluateDeckCompatibility(candidate.deck, {
    selectedFormat: options.selectedFormat,
    selectedMatchType: options.selectedMatchType,
  });
  if (result.selected_format_compatible !== true) return null;
  const cov = result.coverage;
  return {
    ...candidate,
    coveragePct: cov ? coveragePct(cov.total_unique, cov.supported_unique) : null,
    archetype: await classifyCandidate(candidate.deck),
  };
}

function savedId(name: string): string {
  return `saved:${name}`;
}

function feedId(feedIdValue: string, name: string): string {
  return `feed:${feedIdValue}:${name}`;
}

function preconId(deckId: string): string {
  return `precon:${deckId}`;
}

export function legacyAiDeckNameToId(name: string): string {
  return savedId(name);
}

function collectRawCandidates(): Array<Omit<AiDeckCandidate, "coveragePct" | "archetype">> {
  const origins = loadDeckOrigins();
  const candidates: Array<Omit<AiDeckCandidate, "coveragePct" | "archetype">> = [];
  const savedDisplayNames = new Set<string>();
  const mirroredFeedNames = new Set<string>();

  for (const name of listSavedDeckNames()) {
    const deck = loadSavedDeck(name);
    if (!deck) continue;
    const origin = origins[name];
    if (origin) mirroredFeedNames.add(name);
    candidates.push({
      id: savedId(name),
      name,
      source: origin ? { type: "saved", feedId: origin } : { type: "saved" },
      deck,
    });
    savedDisplayNames.add(name);
  }

  for (const sub of listSubscriptions()) {
    const feed = getCachedFeed(sub.sourceId);
    if (!feed) continue;
    for (const deck of feed.decks) {
      if (mirroredFeedNames.has(deck.name) || savedDisplayNames.has(deck.name)) continue;
      candidates.push({
        id: feedId(sub.sourceId, deck.name),
        name: deck.name,
        source: { type: "feed", feedId: sub.sourceId },
        deck: feedDeckToParsedDeck(deck),
      });
    }
  }

  return candidates;
}

async function collectPreconCandidates(
  seenDisplayNames: Set<string>,
): Promise<Array<Omit<AiDeckCandidate, "coveragePct" | "archetype">>> {
  const decks = await loadPreconDeckMap();
  if (!decks) return [];
  return Object.entries(decks).flatMap(([deckIdValue, deck]) => {
    const name = `${deck.name} (${deck.code})`;
    if (seenDisplayNames.has(name)) return [];
    seenDisplayNames.add(name);
    return [{
      id: preconId(deckIdValue),
      name,
      source: { type: "precon", deckId: deckIdValue, code: deck.code },
      deck: preconDeckEntryToParsedDeck(deck),
    }];
  });
}

export async function buildLegalAiDeckCatalog(
  options: AiDeckCatalogOptions,
): Promise<AiDeckCatalogResult> {
  const rawCandidates = collectRawCandidates();
  const displayNames = new Set(rawCandidates.map((candidate) => candidate.name));
  rawCandidates.push(...await collectPreconCandidates(displayNames));

  const legal = await Promise.all(
    rawCandidates.map((candidate) => legalCandidate(candidate, options)),
  );
  return { candidates: legal.filter((candidate): candidate is AiDeckCandidate => candidate !== null) };
}

export function useAiDeckCatalog({
  selectedFormat,
  selectedMatchType,
}: AiDeckCatalogOptions): UseAiDeckCatalogResult {
  const [result, setResult] = useState<UseAiDeckCatalogResult>({
    candidates: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setResult((current) => ({ ...current, loading: true, error: null }));
    buildLegalAiDeckCatalog({ selectedFormat, selectedMatchType })
      .then((catalog) => {
        if (!cancelled) setResult({ ...catalog, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) {
          setResult({
            candidates: [],
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFormat, selectedMatchType]);

  return result;
}
