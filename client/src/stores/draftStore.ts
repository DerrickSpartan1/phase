import { create } from "zustand";

import {
  DraftAdapter,
  type DraftPlayerView,
  type SuggestedDeck,
} from "../adapter/draft-adapter";

// ── Types ───────────────────────────────────────────────────────────────

export type DraftPhase = "setup" | "drafting" | "deckbuilding" | "launching";
export type PoolSortMode = "color" | "type" | "cmc";

interface DraftStoreState {
  adapter: DraftAdapter | null;
  view: DraftPlayerView | null;
  selectedCard: string | null;
  phase: DraftPhase;
  difficulty: number;
  selectedSet: string | null;
  mainDeck: string[];
  landCounts: Record<string, number>;
  poolSortMode: PoolSortMode;
  poolPanelOpen: boolean;
}

interface DraftStoreActions {
  startDraft: (setPoolJson: string, setCode: string, difficulty: number) => Promise<void>;
  pickCard: (cardInstanceId: string) => Promise<void>;
  selectCard: (cardInstanceId: string | null) => void;
  confirmPick: () => Promise<void>;
  addToDeck: (cardName: string) => void;
  removeFromDeck: (cardName: string) => void;
  setLandCount: (landName: string, count: number) => void;
  autoSuggestDeck: () => Promise<void>;
  autoSuggestLands: () => Promise<void>;
  submitDeck: () => Promise<void>;
  setPoolSortMode: (mode: PoolSortMode) => void;
  togglePoolPanel: () => void;
  setDifficulty: (d: number) => void;
  setSelectedSet: (s: string | null) => void;
  reset: () => void;
}

// ── Initial state ───────────────────────────────────────────────────────

const initialState: DraftStoreState = {
  adapter: null,
  view: null,
  selectedCard: null,
  phase: "setup",
  difficulty: 2,
  selectedSet: null,
  mainDeck: [],
  landCounts: {},
  poolSortMode: "color",
  poolPanelOpen: true,
};

// ── Store ───────────────────────────────────────────────────────────────

export const useDraftStore = create<DraftStoreState & DraftStoreActions>()(
  (set, get) => ({
    ...initialState,

    startDraft: async (setPoolJson, setCode, difficulty) => {
      const adapter = new DraftAdapter();

      // Per D-02/RESEARCH Pitfall 2: Hard/VeryHard bots need the card database
      // for deeper evaluation. Load it before starting the draft.
      if (difficulty >= 3) {
        const resp = await fetch(__CARD_DATA_URL__);
        const json = await resp.text();
        await adapter.loadCardDatabase(json);
      }

      const seed = Math.floor(Math.random() * 0xffffffff);
      const view = await adapter.initialize(setPoolJson, difficulty, seed);

      set({
        adapter,
        view,
        phase: "drafting",
        difficulty,
        selectedSet: setCode,
        selectedCard: null,
        mainDeck: [],
        landCounts: {},
      });
    },

    pickCard: async (cardInstanceId) => {
      const { adapter } = get();
      if (!adapter) return;

      const view = await adapter.submitPick(cardInstanceId);
      const nextPhase: DraftPhase =
        view.status === "Deckbuilding" ? "deckbuilding" : "drafting";

      set({ view, phase: nextPhase, selectedCard: null });
    },

    selectCard: (cardInstanceId) => {
      set({ selectedCard: cardInstanceId });
    },

    confirmPick: async () => {
      const { selectedCard, pickCard } = get();
      if (!selectedCard) return;
      await pickCard(selectedCard);
    },

    addToDeck: (cardName) => {
      set((prev) => ({ mainDeck: [...prev.mainDeck, cardName] }));
    },

    removeFromDeck: (cardName) => {
      set((prev) => {
        const idx = prev.mainDeck.indexOf(cardName);
        if (idx === -1) return prev;
        const next = [...prev.mainDeck];
        next.splice(idx, 1);
        return { mainDeck: next };
      });
    },

    setLandCount: (landName, count) => {
      set((prev) => ({
        landCounts: { ...prev.landCounts, [landName]: Math.max(0, count) },
      }));
    },

    autoSuggestDeck: async () => {
      const { adapter } = get();
      if (!adapter) return;

      const result: SuggestedDeck = await adapter.suggestDeck();
      set({ mainDeck: result.main_deck, landCounts: result.lands });
    },

    autoSuggestLands: async () => {
      const { adapter, mainDeck } = get();
      if (!adapter) return;

      const lands = await adapter.suggestLands(mainDeck);
      set({ landCounts: lands });
    },

    submitDeck: async () => {
      const { adapter, mainDeck, landCounts } = get();
      if (!adapter) return;

      // Expand land counts into repeated card names for the deck list
      const landCards: string[] = [];
      for (const [name, count] of Object.entries(landCounts)) {
        for (let i = 0; i < count; i++) {
          landCards.push(name);
        }
      }

      const fullDeck = [...mainDeck, ...landCards];
      const view = await adapter.submitDeck(fullDeck);
      set({ view, phase: "launching" });
    },

    setPoolSortMode: (mode) => {
      set({ poolSortMode: mode });
    },

    togglePoolPanel: () => {
      set((prev) => ({ poolPanelOpen: !prev.poolPanelOpen }));
    },

    setDifficulty: (d) => {
      set({ difficulty: d });
    },

    setSelectedSet: (s) => {
      set({ selectedSet: s });
    },

    reset: () => {
      set(initialState);
    },
  }),
);
