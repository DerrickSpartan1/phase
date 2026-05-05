import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { useDraftStore } from "../stores/draftStore";
import { useGameStore } from "../stores/gameStore";
import { CardPreview } from "../components/card/CardPreview";
import { DraftIntro } from "../components/draft/DraftIntro";
import { SetSelector } from "../components/draft/SetSelector";
import { PackDisplay } from "../components/draft/PackDisplay";
import { PoolPanel } from "../components/draft/PoolPanel";
import { DraftProgress } from "../components/draft/DraftProgress";
import { LimitedDeckBuilder } from "../components/draft/LimitedDeckBuilder";
import { ScreenChrome } from "../components/chrome/ScreenChrome";
import { menuButtonClass } from "../components/menu/buttonStyles";

// ── Constants ──────────────────────────────────────────────────────────

const DIFFICULTY_NAMES = ["VeryEasy", "Easy", "Medium", "Hard", "VeryHard"] as const;

const DRAFT_DECK_SESSION_KEY = "phase:draft-deck";

// ── Helpers ────────────────────────────────────────────────────────────

function storeDraftDeckData(
  gameId: string,
  playerDeck: string[],
  opponentDeck: string[],
): void {
  const data = {
    player: { main_deck: playerDeck, sideboard: [], commander: [] },
    opponent: { main_deck: opponentDeck, sideboard: [], commander: [] },
    ai_decks: [],
  };
  sessionStorage.setItem(
    `${DRAFT_DECK_SESSION_KEY}:${gameId}`,
    JSON.stringify(data),
  );
}

// ── Component ──────────────────────────────────────────────────────────

export function DraftPage() {
  const phase = useDraftStore((s) => s.phase);
  const reset = useDraftStore((s) => s.reset);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [hoveredCardName, setHoveredCardName] = useState<string | null>(null);
  const [introDismissed, setIntroDismissed] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("resume") !== "1") return;
    let cancelled = false;

    async function doResume() {
      setResumeLoading(true);
      try {
        await useDraftStore.getState().resumeDraft();
        if (!cancelled) setIntroDismissed(true);
      } catch {
        await useDraftStore.getState().abandonDraft();
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    }
    doResume();
    return () => { cancelled = true; };
  }, [searchParams]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const handleStartDraft = useCallback(
    async (setCode: string) => {
      const { difficulty, startDraft } = useDraftStore.getState();

      const resp = await fetch(__DRAFT_POOLS_URL__);
      if (!resp.ok) throw new Error(`Failed to load draft pools: ${resp.status}`);
      const allPools: Record<string, unknown> = await resp.json();
      const setPool = allPools[setCode.toLowerCase()] ?? allPools[setCode.toUpperCase()];
      if (!setPool) throw new Error(`No pool data for set: ${setCode}`);

      await startDraft(JSON.stringify(setPool), setCode, difficulty);
    },
    [],
  );

  const handleLaunchMatch = useCallback(async () => {
    const { mainDeck, landCounts, adapter, difficulty } = useDraftStore.getState();
    if (!adapter) return;

    const landCards: string[] = [];
    for (const [name, count] of Object.entries(landCounts)) {
      for (let i = 0; i < count; i++) {
        landCards.push(name);
      }
    }
    const fullDeck = [...mainDeck, ...landCards];

    const botSeat = Math.floor(Math.random() * 7) + 1;
    const botDeck = await adapter.getBotDeck(botSeat);
    const botFullDeck = [
      ...botDeck.main_deck,
      ...Object.entries(botDeck.lands).flatMap(([name, count]) =>
        Array<string>(count).fill(name),
      ),
    ];

    const gameId = crypto.randomUUID();
    storeDraftDeckData(gameId, fullDeck, botFullDeck);

    const headDifficulty = DIFFICULTY_NAMES[difficulty] ?? "Medium";
    useGameStore.setState({ gameId });
    navigate(
      `/game/${gameId}?mode=ai&difficulty=${headDifficulty}&format=Limited&match=bo1&source=draft`,
    );
  }, [navigate]);

  return (
    <div className="menu-scene relative flex min-h-screen flex-col overflow-hidden">
      <ScreenChrome onBack={() => navigate("/draft")} />
      {phase === "drafting" && introDismissed && <CardPreview cardName={hoveredCardName} />}

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-6 py-16">
        {resumeLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-500 border-t-white" />
          </div>
        )}

        {!resumeLoading && phase === "setup" && (
          <div className="mx-auto w-full max-w-4xl">
            <h1 className="mb-8 text-3xl font-bold text-white">Quick Draft</h1>
            <SetSelector onStartDraft={handleStartDraft} />
          </div>
        )}

        {phase === "drafting" && !introDismissed && (
          <DraftIntro mode="quick" onContinue={() => setIntroDismissed(true)} />
        )}

        {phase === "drafting" && introDismissed && (
          <div className="flex gap-4">
            <div className="flex-1">
              <DraftProgress />
              <PackDisplay onCardHover={setHoveredCardName} />
            </div>
            <PoolPanel onCardHover={setHoveredCardName} />
          </div>
        )}

        {phase === "deckbuilding" && (
          <LimitedDeckBuilder />
        )}

        {phase === "launching" && (
          <div className="flex flex-col items-center justify-center gap-6 py-24">
            <div className="text-xl font-medium text-white">
              Your deck is ready!
            </div>
            <button
              onClick={handleLaunchMatch}
              className={menuButtonClass({ tone: "emerald", size: "lg" })}
            >
              Start Match
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
