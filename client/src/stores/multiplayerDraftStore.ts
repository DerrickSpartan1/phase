/**
 * Zustand store for multiplayer P2P draft state.
 *
 * Separate from `draftStore` (Quick Draft, single-player) because the
 * multiplayer draft lifecycle is fundamentally different:
 * - Host/guest asymmetry (host runs WASM, guest is stateless receiver)
 * - Lobby phase with seat management before draft starts
 * - Network events (disconnect, reconnect, kick, pause/resume)
 * - Pairing and match handoff after deckbuilding
 *
 * The store wraps `DraftPodHostAdapter` or `DraftPodGuestAdapter` and
 * projects their events into reactive Zustand state for the React UI.
 */

import { create } from "zustand";

import type { DraftPlayerView, PairingView, SeatPublicView, StandingEntry } from "../adapter/draft-adapter";
import {
  DraftPodHostAdapter,
  type DraftPodHostConfig,
  type DraftPodHostEvent,
  type DraftPodHostStatus,
} from "../adapter/draftPodHostAdapter";
import {
  DraftPodGuestAdapter,
  type DraftPodGuestConfig,
  type DraftPodGuestEvent,
  type DraftPodGuestStatus,
} from "../adapter/draftPodGuestAdapter";

// ── Types ──────────────────────────────────────────────────────────────

export type DraftRole = "host" | "guest";

export type MultiplayerDraftPhase =
  | "idle"
  | "connecting"
  | "lobby"
  | "drafting"
  | "deckbuilding"
  | "pairing"
  | "matchInProgress"
  | "roundComplete"
  | "complete"
  | "error"
  | "kicked"
  | "hostLeft";

export interface PairingInfo {
  round: number;
  table: number;
  opponentName: string;
  matchHostPeerId: string;
  matchId: string;
}

interface MultiplayerDraftState {
  role: DraftRole | null;
  phase: MultiplayerDraftPhase;
  roomCode: string | null;
  draftCode: string | null;
  seatIndex: number | null;
  view: DraftPlayerView | null;
  seats: SeatPublicView[];
  joined: number;
  total: number;
  paused: boolean;
  pauseReason: string | null;
  pairing: PairingInfo | null;
  error: string | null;
  selectedCard: string | null;
  mainDeck: string[];
  landCounts: Record<string, number>;
  timerRemainingMs: number | null;
  standings: StandingEntry[];
  currentRound: number;
  pairings: PairingView[];
  matchPairing: {
    matchId: string;
    opponentSeat: number;
    opponentName: string;
    matchHostPeerId: string;
    isMatchHost: boolean;
  } | null;
  matchAdapter: unknown | null;
}

interface MultiplayerDraftActions {
  /** Host: create a new draft pod and start accepting guests. */
  hostDraft: (config: DraftPodHostConfig) => Promise<void>;
  /** Guest: join an existing draft pod by room code. */
  joinDraft: (config: DraftPodGuestConfig) => Promise<void>;
  /** Host: start the draft once the pod is ready. */
  startDraft: () => Promise<void>;
  /** Both: submit a pick. */
  submitPick: (cardInstanceId: string) => Promise<void>;
  /** Both: select a card (UI highlight before confirming pick). */
  selectCard: (cardInstanceId: string | null) => void;
  /** Both: confirm the currently selected card as pick. */
  confirmPick: () => Promise<void>;
  /** Both: add a card to the deck during deckbuilding. */
  addToDeck: (cardName: string) => void;
  /** Both: remove a card from the deck during deckbuilding. */
  removeFromDeck: (cardName: string) => void;
  /** Both: set land count for a specific basic land. */
  setLandCount: (landName: string, count: number) => void;
  /** Both: submit the built deck. */
  submitDeck: () => Promise<void>;
  /** Host: kick a player from the pod. */
  kickPlayer: (seat: number, reason?: string) => void;
  /** Host: pause the draft. */
  requestPause: () => void;
  /** Host: resume the draft. */
  requestResume: () => void;
  /** Both: tear down the connection and reset state. */
  leave: () => Promise<void>;
  /** Reset store to initial state (without network cleanup). */
  reset: () => void;
  /** Both: start the match for the current pairing. */
  startMatch: () => Promise<void>;
  /** Both: report a match result back to the pod host. */
  reportMatchResult: (matchId: string, winnerSeat: number | null) => void;
  /** Host: advance to the next round (Casual mode). */
  advanceRound: () => void;
  /** Host: override a match result (Casual mode). */
  overrideMatchResult: (matchId: string, winnerSeat: number | null) => void;
  /** Host: replace a disconnected player with a bot (Casual mode). */
  replaceSeatWithBot: (seat: number) => void;
}

// ── Module-level adapter refs ──────────────────────────────────────────

let activeHostAdapter: DraftPodHostAdapter | null = null;
let activeGuestAdapter: DraftPodGuestAdapter | null = null;

// ── Initial state ──────────────────────────────────────────────────────

const initialState: MultiplayerDraftState = {
  role: null,
  phase: "idle",
  roomCode: null,
  draftCode: null,
  seatIndex: null,
  view: null,
  seats: [],
  joined: 0,
  total: 0,
  paused: false,
  pauseReason: null,
  pairing: null,
  error: null,
  selectedCard: null,
  mainDeck: [],
  landCounts: {},
  timerRemainingMs: null,
  standings: [],
  currentRound: 0,
  pairings: [],
  matchPairing: null,
  matchAdapter: null,
};

// ── Store ──────────────────────────────────────────────────────────────

export const useMultiplayerDraftStore = create<
  MultiplayerDraftState & MultiplayerDraftActions
>()((set, get) => ({
  ...initialState,

  hostDraft: async (config) => {
    const adapter = new DraftPodHostAdapter();
    activeHostAdapter = adapter;

    adapter.onEvent((event) => handleHostEvent(event, set));

    set({
      ...initialState,
      role: "host",
      phase: "connecting",
      seatIndex: 0,
    });

    try {
      await adapter.initialize(config);
    } catch {
      // Error already emitted via adapter event
    }
  },

  joinDraft: async (config) => {
    const adapter = new DraftPodGuestAdapter();
    activeGuestAdapter = adapter;

    adapter.onEvent((event) => handleGuestEvent(event, set));

    set({
      ...initialState,
      role: "guest",
      phase: "connecting",
    });

    try {
      await adapter.initialize(config);
    } catch {
      // Error already emitted via adapter event
    }
  },

  startDraft: async () => {
    if (!activeHostAdapter) return;
    await activeHostAdapter.startDraft();
  },

  submitPick: async (cardInstanceId) => {
    const { role } = get();
    if (role === "host" && activeHostAdapter) {
      const view = await activeHostAdapter.submitPick(cardInstanceId);
      set({ view, selectedCard: null });
    } else if (role === "guest" && activeGuestAdapter) {
      await activeGuestAdapter.submitPick(cardInstanceId);
      set({ selectedCard: null });
    }
  },

  selectCard: (cardInstanceId) => {
    set({ selectedCard: cardInstanceId });
  },

  confirmPick: async () => {
    const { selectedCard, submitPick } = get();
    if (!selectedCard) return;
    await submitPick(selectedCard);
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

  submitDeck: async () => {
    const { role, mainDeck, landCounts } = get();
    const landCards: string[] = [];
    for (const [name, count] of Object.entries(landCounts)) {
      for (let i = 0; i < count; i++) {
        landCards.push(name);
      }
    }
    const fullDeck = [...mainDeck, ...landCards];

    if (role === "host" && activeHostAdapter) {
      const view = await activeHostAdapter.submitDeck(fullDeck);
      set({ view });
    } else if (role === "guest" && activeGuestAdapter) {
      await activeGuestAdapter.submitDeck(fullDeck);
    }
  },

  kickPlayer: (seat, reason) => {
    if (!activeHostAdapter) return;
    activeHostAdapter.kickPlayer(seat, reason);
  },

  requestPause: () => {
    if (!activeHostAdapter) return;
    activeHostAdapter.requestPause();
  },

  requestResume: () => {
    if (!activeHostAdapter) return;
    activeHostAdapter.requestResume();
  },

  startMatch: async () => {
    // Stub: full implementation in Plan 05 Task 3 (deck delivery + gameOver bridge).
    // Sets phase to matchInProgress; the match adapter is created in Plan 05.
    const { matchPairing } = get();
    if (!matchPairing) return;
    set({ phase: "matchInProgress" });
  },

  reportMatchResult: (matchId, winnerSeat) => {
    const { role } = get();
    if (role === "host" && activeHostAdapter) {
      void activeHostAdapter.overrideMatchResult(matchId, winnerSeat);
    } else if (role === "guest" && activeGuestAdapter) {
      activeGuestAdapter.sendMatchResult(matchId, winnerSeat);
    }
  },

  advanceRound: () => {
    if (!activeHostAdapter) return;
    void activeHostAdapter.advanceRound();
  },

  overrideMatchResult: (matchId, winnerSeat) => {
    if (!activeHostAdapter) return;
    void activeHostAdapter.overrideMatchResult(matchId, winnerSeat);
  },

  replaceSeatWithBot: (seat) => {
    if (!activeHostAdapter) return;
    void activeHostAdapter.replaceSeatWithBot(seat);
  },

  leave: async () => {
    if (activeHostAdapter) {
      await activeHostAdapter.dispose();
      activeHostAdapter = null;
    }
    if (activeGuestAdapter) {
      await activeGuestAdapter.dispose();
      activeGuestAdapter = null;
    }
    set(initialState);
  },

  reset: () => {
    set(initialState);
  },
}));

// ── Event handlers ─────────────────────────────────────────────────────

function hostStatusToPhase(status: DraftPodHostStatus): MultiplayerDraftPhase {
  switch (status) {
    case "idle":
      return "idle";
    case "connecting":
      return "connecting";
    case "lobby":
      return "lobby";
    case "drafting":
      return "drafting";
    case "deckbuilding":
      return "deckbuilding";
    case "pairing":
      return "pairing";
    case "matchInProgress":
      return "matchInProgress";
    case "roundComplete":
      return "roundComplete";
    case "complete":
      return "complete";
    case "error":
      return "error";
  }
}

function guestStatusToPhase(status: DraftPodGuestStatus): MultiplayerDraftPhase {
  switch (status) {
    case "idle":
      return "idle";
    case "connecting":
      return "connecting";
    case "lobby":
      return "lobby";
    case "drafting":
      return "drafting";
    case "deckbuilding":
      return "deckbuilding";
    case "matchInProgress":
      return "matchInProgress";
    case "complete":
      return "complete";
    case "kicked":
      return "kicked";
    case "hostLeft":
      return "hostLeft";
    case "error":
      return "error";
  }
}

type SetFn = (
  partial:
    | Partial<MultiplayerDraftState>
    | ((state: MultiplayerDraftState) => Partial<MultiplayerDraftState>),
) => void;

function handleHostEvent(event: DraftPodHostEvent, set: SetFn): void {
  switch (event.type) {
    case "statusChanged":
      set({ phase: hostStatusToPhase(event.status) });
      break;
    case "roomCreated":
      set({ roomCode: event.roomCode });
      break;
    case "viewUpdated":
      set({
        view: event.view,
        timerRemainingMs: event.view.timer_remaining_ms ?? null,
        standings: event.view.standings ?? [],
        currentRound: event.view.current_round ?? 0,
        pairings: event.view.pairings ?? [],
      });
      break;
    case "lobbyUpdate":
      set({ joined: event.joined, total: event.total, seats: event.seats });
      break;
    case "lobbyFull":
      break;
    case "draftStarted":
      set({ view: event.view, phase: "drafting" });
      break;
    case "draftComplete":
      set({ phase: "deckbuilding" });
      break;
    case "allDecksSubmitted":
      set({ phase: "pairing" });
      break;
    case "pairingsGenerated":
      set({ phase: "matchInProgress", currentRound: event.round, pairings: event.pairings });
      break;
    case "roundAdvanced":
      set({ phase: "pairing", currentRound: event.newRound });
      break;
    case "matchResultReceived":
      // Informational — standings update comes via viewUpdated
      break;
    case "timerExpired":
      break;
    case "error":
      set({ error: event.message });
      break;
    // Seat events are informational — the lobby update carries the authoritative seat list
    case "seatJoined":
    case "seatReconnected":
    case "seatDisconnected":
    case "seatKicked":
    case "pickReceived":
    case "roundComplete":
    case "deckSubmitted":
      break;
  }
}

function handleGuestEvent(event: DraftPodGuestEvent, set: SetFn): void {
  switch (event.type) {
    case "statusChanged":
      set({ phase: guestStatusToPhase(event.status) });
      break;
    case "joined":
      set({
        seatIndex: event.seatIndex,
        draftCode: event.draftCode,
        phase: "lobby",
      });
      break;
    case "reconnected":
      set({ seatIndex: event.seatIndex });
      break;
    case "viewUpdated":
      set({
        view: event.view,
        timerRemainingMs: event.view.timer_remaining_ms ?? null,
        standings: event.view.standings ?? [],
        currentRound: event.view.current_round ?? 0,
        pairings: event.view.pairings ?? [],
      });
      break;
    case "pickAcknowledged":
      set({ view: event.view });
      break;
    case "lobbyUpdate":
      set({ seats: event.seats, joined: event.joined, total: event.total });
      break;
    case "draftPaused":
      set({ paused: true, pauseReason: event.reason });
      break;
    case "draftResumed":
      set({ paused: false, pauseReason: null });
      break;
    case "pairing":
      set({
        pairing: {
          round: event.round,
          table: event.table,
          opponentName: event.opponentName,
          matchHostPeerId: event.matchHostPeerId,
          matchId: event.matchId,
        },
      });
      break;
    case "matchResult":
      break;
    case "timerSync":
      set({ timerRemainingMs: event.remainingMs });
      break;
    case "matchStart":
      set({
        matchPairing: {
          matchId: event.matchId,
          opponentSeat: event.opponentSeat,
          opponentName: event.opponentName,
          matchHostPeerId: event.matchHostPeerId,
          isMatchHost: event.isMatchHost,
        },
        phase: "matchInProgress",
      });
      break;
    case "kicked":
      set({ phase: "kicked", error: event.reason });
      break;
    case "hostLeft":
      set({ phase: "hostLeft", error: event.reason });
      break;
    case "error":
      set({ error: event.message });
      break;
    case "reconnecting":
    case "reconnectFailed":
      break;
  }
}
