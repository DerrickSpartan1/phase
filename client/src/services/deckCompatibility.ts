import type { GameFormat, MatchType } from "../adapter/types";
import { EngineWorkerClient } from "../adapter/engine-worker-client";
import { expandParsedDeck, type ParsedDeck } from "./deckParser";

export interface CompatibilityCheck {
  compatible: boolean;
  reasons: string[];
}

export type ParseCategory = "keyword" | "ability" | "trigger" | "static" | "replacement" | "cost";

export interface ParsedItem {
  category: ParseCategory;
  label: string;
  source_text?: string;
  supported: boolean;
  details?: [string, string][];
  children?: ParsedItem[];
}

export interface UnsupportedCard {
  name: string;
  gaps: string[];
  copies?: number;
  oracle_text?: string;
  parse_details?: ParsedItem[];
}

export interface DeckCoverage {
  total_unique: number;
  supported_unique: number;
  unsupported_cards: UnsupportedCard[];
}

export interface DeckCompatibilityResult {
  standard: CompatibilityCheck;
  commander: CompatibilityCheck;
  bo3_ready: boolean;
  unknown_cards: string[];
  selected_format_compatible?: boolean | null;
  selected_format_reasons: string[];
  /** Combined color identity of all cards in the deck, in WUBRG order (e.g. ["W", "U", "R"]). */
  color_identity: string[];
  /** Engine coverage summary — how many unique cards are fully supported. */
  coverage?: DeckCoverage | null;
  /** Per-format legality: maps format key (e.g. "standard", "modern") to status ("legal", "not_legal", "banned"). */
  format_legality?: Record<string, string>;
}

interface DeckCompatibilityRequest {
  main_deck: string[];
  sideboard: string[];
  commander: string[];
  selected_format?: GameFormat | null;
  selected_match_type?: MatchType | null;
  summary_only?: boolean;
}

interface EvaluateOptions {
  selectedFormat?: GameFormat | null;
  selectedMatchType?: MatchType | null;
  summaryOnly?: boolean;
  onResult?: (name: string, result: DeckCompatibilityResult) => void;
  onStatus?: (status: "starting-worker" | "loading-card-database" | "checking-deck", name?: string) => void;
}

let compatibilityWorkerPromise: Promise<EngineWorkerClient> | null = null;
const fullCompatibilityCache = new Map<string, DeckCompatibilityResult>();
const summaryCompatibilityCache = new Map<string, DeckCompatibilityResult>();
const fullCompatibilityInflight = new Map<string, Promise<DeckCompatibilityResult>>();
const summaryCompatibilityInflight = new Map<string, Promise<DeckCompatibilityResult>>();

function logCompatibilityStatus(message: string): void {
  console.info(`[deck-compat] ${message}`);
}

async function getCompatibilityWorker(onStatus?: EvaluateOptions["onStatus"]): Promise<EngineWorkerClient> {
  if (!compatibilityWorkerPromise) {
    compatibilityWorkerPromise = (async () => {
      logCompatibilityStatus("starting compatibility worker");
      onStatus?.("starting-worker");
      const workerStartedAt = performance.now();
      const worker = new EngineWorkerClient();
      await worker.initialize();
      logCompatibilityStatus(`compatibility worker initialized in ${Math.round(performance.now() - workerStartedAt)}ms`);
      onStatus?.("loading-card-database");
      logCompatibilityStatus("loading compatibility card database");
      const loadStartedAt = performance.now();
      await worker.loadCardDbFromUrl();
      logCompatibilityStatus(`compatibility card database loaded in ${Math.round(performance.now() - loadStartedAt)}ms`);
      return worker;
    })();
  }
  return compatibilityWorkerPromise;
}

function buildRequest(deck: ParsedDeck, options: EvaluateOptions): DeckCompatibilityRequest {
  return {
    ...expandParsedDeck(deck),
    selected_format: options.selectedFormat ?? null,
    selected_match_type: options.selectedMatchType ?? null,
    summary_only: options.summaryOnly ?? false,
  };
}

function compatibilityCacheKey(request: DeckCompatibilityRequest): string {
  return JSON.stringify({
    main_deck: request.main_deck,
    sideboard: request.sideboard,
    commander: request.commander,
    selected_format: request.selected_format ?? null,
    selected_match_type: request.selected_match_type ?? null,
  });
}

export async function evaluateDeckCompatibility(
  deck: ParsedDeck,
  options: EvaluateOptions = {},
): Promise<DeckCompatibilityResult> {
  const request = buildRequest(deck, options);
  const cacheKey = compatibilityCacheKey(request);
  if (request.summary_only) {
    const cached = fullCompatibilityCache.get(cacheKey) ?? summaryCompatibilityCache.get(cacheKey);
    if (cached) {
      logCompatibilityStatus(`cache hit (format=${request.selected_format ?? "none"}, summaryOnly=true)`);
      return cached;
    }
  } else {
    const cached = fullCompatibilityCache.get(cacheKey);
    if (cached) {
      logCompatibilityStatus(`cache hit (format=${request.selected_format ?? "none"}, summaryOnly=false)`);
      return cached;
    }
  }

  const inflightMap = request.summary_only ? summaryCompatibilityInflight : fullCompatibilityInflight;
  const existingInflight = request.summary_only
    ? (fullCompatibilityInflight.get(cacheKey) ?? summaryCompatibilityInflight.get(cacheKey))
    : fullCompatibilityInflight.get(cacheKey);
  if (existingInflight) return existingInflight;

  const promise = evaluateDeckCompatibilityUncached(request, options).then((result) => {
    if (request.summary_only) {
      summaryCompatibilityCache.set(cacheKey, result);
    } else {
      fullCompatibilityCache.set(cacheKey, result);
      summaryCompatibilityCache.set(cacheKey, result);
    }
    return result;
  }).finally(() => {
    inflightMap.delete(cacheKey);
  });
  inflightMap.set(cacheKey, promise);
  return promise;
}

async function evaluateDeckCompatibilityUncached(
  request: DeckCompatibilityRequest,
  options: EvaluateOptions,
): Promise<DeckCompatibilityResult> {
  const worker = await getCompatibilityWorker(options.onStatus);
  options.onStatus?.("checking-deck");
  const cardCount = request.main_deck.length + request.sideboard.length + request.commander.length;
  logCompatibilityStatus(
    `checking deck (${cardCount} cards, format=${request.selected_format ?? "none"}, summaryOnly=${request.summary_only})`,
  );
  const startedAt = performance.now();
  const result = await worker.evaluateDeckCompatibility(request) as DeckCompatibilityResult;
  logCompatibilityStatus(
    `checked deck in ${Math.round(performance.now() - startedAt)}ms (compatible=${result.selected_format_compatible ?? "n/a"}, coverage=${result.coverage ? `${result.coverage.supported_unique}/${result.coverage.total_unique}` : "none"})`,
  );
  return result;
}

export async function evaluateDeckCompatibilityBatch(
  decks: Array<{ name: string; deck: ParsedDeck }>,
  options: EvaluateOptions = {},
): Promise<Record<string, DeckCompatibilityResult>> {
  const results: Record<string, DeckCompatibilityResult> = {};
  for (const { name, deck } of decks) {
    logCompatibilityStatus(`batch item start: ${name}`);
    const result = await evaluateDeckCompatibility(deck, {
      ...options,
      onStatus: (status) => options.onStatus?.(status, name),
    });
    results[name] = result;
    logCompatibilityStatus(`batch item result: ${name}`);
    options.onResult?.(name, result);
  }

  return results;
}
